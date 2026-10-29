export { baseConfigSchema, grpcAddress, loadConfig, type BaseConfig } from './config.js';
export { createLogger, type Logger } from './logger.js';
export { currentContext, enterContext, remainingMs, runWithContext, type RequestContext } from './context.js';
export {
  AppError,
  conflict,
  forbidden,
  fromGrpcError,
  grpcStatusOf,
  HTTP_STATUS,
  invalid,
  isTransient,
  notFound,
  toAppError,
  toGrpcError,
  unauthenticated,
  type ErrorCode,
} from './errors.js';
export { initMetrics, metrics, registry } from './metrics.js';
export { startHealthServer, type HealthServer } from './health.js';
export { createPgDb, type Db, type Queryable, type QueryResult } from './db/db.js';
export { hash32, loadMigrations, migrate, PLATFORM_MIGRATIONS, type Migration } from './db/migrate.js';
export { EVENTS, isEventType, type EventPayloads, type EventType, type OutgoingEvent, type Topic } from './events/registry.js';
export { decodeEvent, decodeRecord, encodeEvent, PermanentEventError, toRecord, type InboundEvent, type RawRecord } from './events/codec.js';
export { dispatch, type EventBus, type EventHandler, type EventHandlers } from './events/bus.js';
export { KafkaEventBus, type KafkaBusOptions } from './events/kafka-bus.js';
export { enqueue, enqueueTombstone, maintainOutbox, OUTBOX_SHARDS, OutboxRelay, shardOf } from './events/outbox.js';
export { processOnce } from './events/inbox.js';
export { createRedisClient, MemoryStore, RedisStore, type GcraResult, type KeyValueStore } from './cache/kv.js';
export { MemoryPubSub, RedisPubSub, type PubSub, type PubSubListener } from './realtime/pubsub.js';
export { ACCESS_COOKIE, JwtVerifier, parseCookies, REFRESH_COOKIE, type AccessClaims, type AccessRole } from './auth/jwt.js';
export { jsonCodec, ReadThroughCache, type CacheCodec, type CacheOptions } from './cache/cache.js';
export { RateLimiter, type RateLimitDecision, type RateLimitRule } from './cache/rate-limit.js';
export { createDependencyPolicy, RetryBudget, type DependencyPolicy } from './resilience.js';
export { createGrpcClient, PROTO_LOADER_OPTIONS, type CallOptions, type GrpcClientOptions, type PromiseClient } from './grpc/client.js';
export { GrpcExceptionFilter, GrpcObservabilityInterceptor, grpcServerOptions, NestPinoLogger, type GrpcServiceSpec } from './grpc/server.js';
export { CONFIG, DB, EVENT_BUS, KV, LOGGER, PlatformModule, PUBSUB, type PlatformResources } from './nest.js';
export { runMigrations, runService, type ServiceOptions } from './bootstrap.js';
export { assertProductionSecret, createFieldCipher, DEV_FIELD_KEY, type FieldCipher } from './crypto.js';
export { createErasureAck, type ErasureAck } from './privacy.js';
export { ensureMonthlyUuidPartitions, uuidv7Bound } from './db/partitions.js';
