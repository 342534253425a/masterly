import { z } from 'zod';

/** Переменные окружения, общие для всех сервисов (см. infra/docker/env/common.env и Helm values). */
export const baseConfigSchema = z.object({
  SERVICE_NAME: z.string().min(1),
  SERVICE_VERSION: z.string().default('dev'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  GRPC_PORT: z.coerce.number().int().min(0).default(0),
  HEALTH_PORT: z.coerce.number().int().min(0).default(9464),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  DATABASE_URL: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(8),
  KAFKA_BROKERS: z.string().optional(),
  KAFKA_SASL_USERNAME: z.string().optional(),
  KAFKA_SASL_PASSWORD: z.string().optional(),
  KAFKA_SSL: z.stringbool().default(false),
  REDIS_URL: z.string().optional(),
  REDIS_CLUSTER: z.stringbool().default(false),
  REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(50),
});

export type BaseConfig = z.infer<typeof baseConfigSchema>;

/** Разбирает окружение по базовой схеме + схеме сервиса. Ошибка конфигурации — падение на старте, а не в рантайме. */
export function loadConfig<S extends z.ZodRawShape>(extra: S, env: NodeJS.ProcessEnv = process.env) {
  const parsed = baseConfigSchema.extend(extra).safeParse(env);
  if (!parsed.success) throw new Error(`Некорректная конфигурация сервиса:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

/** Адреса gRPC-зависимостей: GRPC_CATALOG=catalog:50052 → dns:///catalog:50052 (балансировка round_robin). */
export function grpcAddress(value: string): string {
  return value.includes('://') ? value : `dns:///${value}`;
}
