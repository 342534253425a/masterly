import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import type { PGliteOptions } from '@electric-sql/pglite';
import type { DynamicModule } from '@nestjs/common';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { MemoryStore } from './cache/kv.js';
import { GrpcExceptionFilter, GrpcObservabilityInterceptor, grpcServerOptions, type GrpcServiceSpec } from './grpc/server.js';
import type { BaseConfig } from './config.js';
import type { Db, Queryable, QueryResult } from './db/db.js';
import { migrate, type Migration } from './db/migrate.js';
import { createLogger } from './logger.js';
import { InMemoryEventBus } from './events/memory-bus.js';
import type { PlatformResources } from './nest.js';

export { InMemoryEventBus } from './events/memory-bus.js';
export { MemoryStore } from './cache/kv.js';

interface PgliteLike {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; affectedRows?: number }>;
  exec(sql: string): Promise<unknown>;
}

/**
 * Настоящий PostgreSQL в процессе (PGlite, WASM): миграции, секции, advisory-локи и SKIP LOCKED
 * проверяются в тестах без Docker. Расширения (pg_trgm и др.) передаёт сервис.
 */
export async function createTestDb(options: { extensions?: Record<string, unknown>; migrations?: Migration[] } = {}): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const pgOptions: PGliteOptions = { extensions: options.extensions as PGliteOptions['extensions'], parsers: { 20: (value: string) => Number(value) } };
  const pg = await PGlite.create(pgOptions);

  const wrap = (target: PgliteLike): Queryable => ({
    async query<R>(text: string, params?: readonly unknown[]): Promise<QueryResult<R>> {
      const result = await target.query(text, params ? [...params] : undefined);
      return { rows: result.rows as R[], rowCount: result.rows.length || result.affectedRows || 0 };
    },
    async exec(sql: string) {
      await target.exec(sql);
    },
  });

  const db: Db = {
    ...wrap(pg as unknown as PgliteLike),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx as unknown as PgliteLike))),
    close: () => pg.close(),
  };
  if (options.migrations) await migrate(db, options.migrations);
  return db;
}

/**
 * Настоящий gRPC-микросервис NestJS в процессе теста (те же интерсептор и фильтр ошибок, что в проде):
 * проверяет декораторы ts-proto, DI и сериализацию protobuf целиком.
 */
export async function startTestMicroservice(module: DynamicModule, spec: GrpcServiceSpec): Promise<{ address: string; close(): Promise<void> }> {
  await import('reflect-metadata');
  const { NestFactory } = await import('@nestjs/core');
  const { Transport } = await import('@nestjs/microservices');
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as AddressInfo).port;
  await new Promise((resolve) => probe.close(resolve));

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(module, { transport: Transport.GRPC, options: grpcServerOptions(spec, port), logger: false });
  app.useGlobalInterceptors(new GrpcObservabilityInterceptor());
  app.useGlobalFilters(new GrpcExceptionFilter(createLogger({ service: 'test', level: 'silent' })));
  await app.listen();
  return { address: `127.0.0.1:${port}`, close: () => app.close() };
}

/** Ресурсы платформы для тестов сервиса: PGlite, шина и key-value в памяти, тихий логгер. */
export async function createTestResources(service: string, options: { migrations?: Migration[]; extensions?: Record<string, unknown> } = {}) {
  const db = await createTestDb(options);
  const bus = new InMemoryEventBus();
  const kv = new MemoryStore();
  const config = { SERVICE_NAME: service, SERVICE_VERSION: 'test', NODE_ENV: 'test', LOG_LEVEL: 'silent' } as BaseConfig;
  const logger = createLogger({ service, level: 'silent' });
  const resources: PlatformResources & { db: Db; bus: InMemoryEventBus; kv: MemoryStore } = { config, logger, db, bus, kv };
  return resources;
}
