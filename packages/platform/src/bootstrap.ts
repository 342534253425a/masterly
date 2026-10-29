import 'reflect-metadata';
import type { DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { RedisStore } from './cache/kv.js';
import type { BaseConfig } from './config.js';
import { createPgDb, type Db } from './db/db.js';
import { loadMigrations, migrate } from './db/migrate.js';
import { KafkaEventBus } from './events/kafka-bus.js';
import { maintainOutbox, OutboxRelay } from './events/outbox.js';
import { GrpcExceptionFilter, GrpcObservabilityInterceptor, grpcServerOptions, NestPinoLogger, type GrpcServiceSpec } from './grpc/server.js';
import { startHealthServer } from './health.js';
import { createLogger } from './logger.js';
import { RedisPubSub } from './realtime/pubsub.js';
import { initMetrics } from './metrics.js';
import type { PlatformResources } from './nest.js';
import { shutdownTelemetry } from './telemetry.js';

export interface ServiceOptions {
  config: BaseConfig;
  grpc: GrpcServiceSpec;
  /** Корневой модуль сервиса, получающий ресурсы платформы. */
  module: (resources: PlatformResources) => DynamicModule;
  needs?: { db?: boolean; bus?: boolean; kv?: boolean; outbox?: boolean; pubsub?: boolean };
  /** Дополнительный сервер процесса (например, WebSocket): запускается после gRPC, при остановке закрывается первым. */
  attach?: (resources: PlatformResources) => Promise<{ close(): Promise<void> }>;
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

/**
 * Запуск доменного сервиса: health и метрики (:9464) → ресурсы (PG, Kafka, Redis) → gRPC (NestJS) → relay outbox → ready.
 * SIGTERM: not ready → gRPC доотвечает текущие вызовы → потребители коммитят offset → relay → пулы → трейсы → выход.
 */
export async function runService(options: ServiceOptions): Promise<void> {
  const { config } = options;
  const needs = options.needs ?? {};
  initMetrics(config.SERVICE_NAME);
  const logger = createLogger({ service: config.SERVICE_NAME, version: config.SERVICE_VERSION, level: config.LOG_LEVEL });
  process.on('unhandledRejection', (error) => logger.error({ err: error }, 'unhandledRejection'));

  const health = await startHealthServer(config.HEALTH_PORT);
  const resources: PlatformResources = { config, logger };
  if (needs.db) resources.db = createPgDb(required(config.DATABASE_URL, 'DATABASE_URL'), { max: config.DB_POOL_MAX, applicationName: config.SERVICE_NAME });
  if (needs.bus) {
    resources.bus = new KafkaEventBus({
      clientId: config.SERVICE_NAME,
      brokers: required(config.KAFKA_BROKERS, 'KAFKA_BROKERS').split(','),
      ssl: config.KAFKA_SSL,
      sasl: config.KAFKA_SASL_USERNAME && config.KAFKA_SASL_PASSWORD ? { username: config.KAFKA_SASL_USERNAME, password: config.KAFKA_SASL_PASSWORD } : undefined,
      logger,
    });
  }
  if (needs.kv) resources.kv = new RedisStore(required(config.REDIS_URL, 'REDIS_URL'), { cluster: config.REDIS_CLUSTER, commandTimeoutMs: config.REDIS_COMMAND_TIMEOUT_MS });
  if (needs.pubsub) resources.pubsub = new RedisPubSub(required(config.REDIS_URL, 'REDIS_URL'), { cluster: config.REDIS_CLUSTER });
  const relay = needs.outbox && resources.db && resources.bus ? new OutboxRelay(resources.db, resources.bus, logger) : undefined;

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(options.module(resources), {
    transport: Transport.GRPC,
    options: grpcServerOptions(options.grpc, config.GRPC_PORT),
    logger: new NestPinoLogger(logger),
  });
  app.useGlobalInterceptors(new GrpcObservabilityInterceptor());
  app.useGlobalFilters(new GrpcExceptionFilter(logger));
  await app.listen();
  const attached = await options.attach?.(resources);
  relay?.start();
  health.setReady(true);
  logger.info({ grpcPort: config.GRPC_PORT, healthPort: health.port }, 'сервис запущен');

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'остановка');
    health.setReady(false);
    const killer = setTimeout(() => {
      logger.error('остановка не уложилась в SHUTDOWN_TIMEOUT_MS — принудительный выход');
      process.exit(1);
    }, config.SHUTDOWN_TIMEOUT_MS);
    try {
      await attached?.close();
      await app.close();
      await relay?.stop();
      await resources.bus?.close();
      await resources.kv?.close();
      await resources.pubsub?.close();
      await resources.db?.close();
      await health.close();
      await shutdownTelemetry();
    } catch (error) {
      logger.error({ err: error }, 'ошибка при остановке');
    }
    clearTimeout(killer);
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

/** dist/migrate.js: Helm-хук pre-upgrade применяет миграции сервиса до выкатки подов. */
export async function runMigrations(options: { service: string; databaseUrl: string | undefined; dir: string; after?: (db: Db) => Promise<void> }): Promise<void> {
  const logger = createLogger({ service: options.service });
  const db = createPgDb(required(options.databaseUrl, 'DATABASE_URL'), { max: 1, applicationName: `${options.service}-migrate` });
  try {
    const applied = await migrate(db, await loadMigrations(options.dir), (name) => logger.info({ migration: name }, 'миграция применена'));
    // Секции outbox создаются до прихода трафика: иначе события дня осядут в DEFAULT и секцию дня не создать
    await maintainOutbox(db);
    await options.after?.(db);
    logger.info({ applied: applied.length }, 'миграции завершены');
  } finally {
    await db.close();
  }
}
