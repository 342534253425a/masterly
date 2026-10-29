import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

/**
 * Реестр метрик сервиса. Имена согласованы с дашбордами и алертами
 * (infra/docker/observability, docs/architecture/observability.md#3-каталог-метрик).
 */
export const registry = new Registry();

let initialized = false;

export function initMetrics(service: string): void {
  if (initialized) return;
  registry.setDefaultLabels({ service });
  collectDefaultMetrics({ register: registry });
  initialized = true;
}

const LATENCY_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const registers = [registry];

export const metrics = {
  httpRequests: new Counter({ name: 'http_server_requests_total', help: 'HTTP-запросы', labelNames: ['method', 'route', 'code'] as const, registers }),
  httpDuration: new Histogram({ name: 'http_server_request_duration_seconds', help: 'Длительность HTTP-запросов', labelNames: ['method', 'route'] as const, buckets: LATENCY_BUCKETS, registers }),
  grpcHandled: new Counter({ name: 'grpc_server_handled_total', help: 'Обработанные gRPC-вызовы', labelNames: ['grpc_method', 'grpc_code'] as const, registers }),
  grpcHandling: new Histogram({ name: 'grpc_server_handling_seconds', help: 'Длительность обработки gRPC', labelNames: ['grpc_method'] as const, buckets: LATENCY_BUCKETS, registers }),
  grpcClientHandled: new Counter({ name: 'grpc_client_handled_total', help: 'Исходящие gRPC-вызовы', labelNames: ['target', 'grpc_method', 'grpc_code'] as const, registers }),
  grpcClientHandling: new Histogram({ name: 'grpc_client_handling_seconds', help: 'Длительность исходящих gRPC-вызовов', labelNames: ['target', 'grpc_method'] as const, buckets: LATENCY_BUCKETS, registers }),
  kafkaLag: new Gauge({ name: 'kafka_consumergroup_lag', help: 'Лаг consumer-группы', labelNames: ['group', 'topic', 'partition'] as const, registers }),
  kafkaConsumed: new Counter({ name: 'kafka_messages_consumed_total', help: 'Прочитанные сообщения', labelNames: ['topic'] as const, registers }),
  kafkaProduced: new Counter({ name: 'kafka_messages_produced_total', help: 'Опубликованные сообщения', labelNames: ['topic'] as const, registers }),
  kafkaDlq: new Counter({ name: 'kafka_dlq_messages_total', help: 'Сообщения, отправленные в DLQ', labelNames: ['topic'] as const, registers }),
  outboxPending: new Gauge({ name: 'outbox_pending_events', help: 'Неопубликованные события outbox', registers }),
  outboxPublishLag: new Histogram({ name: 'outbox_publish_lag_seconds', help: 'От записи в outbox до подтверждения Kafka', buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60], registers }),
  cacheRequests: new Counter({ name: 'cache_requests_total', help: 'Обращения к кэшу', labelNames: ['cache', 'result'] as const, registers }),
  breakerOpen: new Gauge({ name: 'circuit_breaker_open', help: '1 — circuit breaker открыт', labelNames: ['target'] as const, registers }),
  dbPool: new Gauge({ name: 'db_pool_connections', help: 'Соединения пула БД', labelNames: ['state'] as const, registers }),
  rateLimitRejections: new Counter({ name: 'rate_limit_rejections_total', help: 'Отказы rate limiter', labelNames: ['route_class'] as const, registers }),
  loadShed: new Counter({ name: 'load_shed_total', help: 'Запросы, отброшенные при перегрузке', labelNames: ['priority'] as const, registers }),
  wsConnections: new Gauge({ name: 'websocket_connections', help: 'Открытые WebSocket-соединения пода', registers }),
  wsRejected: new Counter({ name: 'websocket_rejected_total', help: 'Отклонённые подключения WebSocket', labelNames: ['reason'] as const, registers }),
  wsSignals: new Counter({ name: 'websocket_signals_total', help: 'Сигналы, отправленные в сокеты', labelNames: ['type'] as const, registers }),
};
