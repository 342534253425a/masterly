import { createLogger, initMetrics, KafkaEventBus, loadConfig, MemoryStore, RedisStore, startHealthServer, type KeyValueStore } from '@masterly/platform';
import { shutdownTelemetry } from '@masterly/platform/telemetry';
import { z } from 'zod';
import { Authenticator } from './auth.js';
import { createBackends } from './backends.js';
import { buildGateway } from './server.js';

const config = loadConfig({
  HTTP_PORT: z.coerce.number().int().default(8080),
  PUBLIC_URL: z.string().url().default('http://localhost:8080'),
  JWT_ISSUER: z.string().default('https://id.masterly.local'),
  ANALYTICS_SALT: z.string().default('masterly-dev'),
  COOKIE_SECURE: z.stringbool().optional(),
  GRPC_IDENTITY: z.string().default('identity:50051'),
  GRPC_CATALOG: z.string().default('catalog:50052'),
  GRPC_SEARCH: z.string().default('search:50053'),
  GRPC_LEADS: z.string().default('leads:50054'),
  GRPC_REVIEWS: z.string().default('reviews:50055'),
  GRPC_MESSAGING: z.string().default('messaging:50056'),
  GRPC_NOTIFICATIONS: z.string().default('notifications:50057'),
  GRPC_MEDIA: z.string().default('media:50058'),
  GRPC_ANALYTICS: z.string().default('analytics:50059'),
  GRPC_TRUST: z.string().default('trust:50060'),
});

initMetrics(config.SERVICE_NAME);
const logger = createLogger({ service: config.SERVICE_NAME, version: config.SERVICE_VERSION, level: config.LOG_LEVEL });
const health = await startHealthServer(config.HEALTH_PORT);

// Без Redis лимиты и идемпотентность работают в памяти пода — только для локальной разработки
const kv: KeyValueStore = config.REDIS_URL ? new RedisStore(config.REDIS_URL, { cluster: config.REDIS_CLUSTER, commandTimeoutMs: config.REDIS_COMMAND_TIMEOUT_MS }) : new MemoryStore();
if (!config.REDIS_URL) logger.warn('REDIS_URL не задан: лимиты и идемпотентность — в памяти пода');
const bus = config.KAFKA_BROKERS
  ? new KafkaEventBus({
      clientId: config.SERVICE_NAME,
      brokers: config.KAFKA_BROKERS.split(','),
      ssl: config.KAFKA_SSL,
      sasl: config.KAFKA_SASL_USERNAME && config.KAFKA_SASL_PASSWORD ? { username: config.KAFKA_SASL_USERNAME, password: config.KAFKA_SASL_PASSWORD } : undefined,
      logger,
    })
  : undefined;

const backends = createBackends({
  identity: config.GRPC_IDENTITY, catalog: config.GRPC_CATALOG, search: config.GRPC_SEARCH, leads: config.GRPC_LEADS, reviews: config.GRPC_REVIEWS,
  messaging: config.GRPC_MESSAGING, notifications: config.GRPC_NOTIFICATIONS, media: config.GRPC_MEDIA, analytics: config.GRPC_ANALYTICS, trust: config.GRPC_TRUST,
});

const app = buildGateway({
  backends,
  auth: new Authenticator(backends.identity, config.JWT_ISSUER),
  kv,
  logger,
  publish: bus ? (records) => bus.publish(records) : undefined,
  settings: {
    issuer: config.JWT_ISSUER,
    cookieSecure: config.COOKIE_SECURE ?? config.NODE_ENV === 'production',
    analyticsSalt: config.ANALYTICS_SALT,
    publicUrl: config.PUBLIC_URL,
    accessTtlSec: 900,
    refreshTtlSec: 60 * 24 * 3600,
  },
});

await app.listen({ host: '0.0.0.0', port: config.HTTP_PORT });
health.setReady(true);
logger.info({ port: config.HTTP_PORT }, 'шлюз запущен');

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'остановка шлюза');
  health.setReady(false);
  const killer = setTimeout(() => process.exit(1), config.SHUTDOWN_TIMEOUT_MS);
  await app.close().catch(() => undefined); // дорабатывает текущие запросы
  await bus?.close();
  await kv.close();
  backends.close();
  await health.close();
  await shutdownTelemetry();
  clearTimeout(killer);
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
