import { join } from 'node:path';
import { credentials, loadPackageDefinition, Metadata, type ServiceClientConstructor, type ServiceError } from '@grpc/grpc-js';
import { loadSync, type Options } from '@grpc/proto-loader';
import { PROTO_DIR } from '@masterly/proto';
import type { Observable } from 'rxjs';
import { currentContext, remainingMs } from '../context.js';
import { AppError, isTransient, toAppError } from '../errors.js';
import { metrics } from '../metrics.js';
import { createDependencyPolicy, RetryBudget } from '../resilience.js';

/** Параметры загрузчика согласованы с ts-proto (camelCase-поля, enum строками, int64 числами). */
export const PROTO_LOADER_OPTIONS: Options = { keepCase: false, longs: Number, enums: String, defaults: true, oneofs: true, includeDirs: [PROTO_DIR] };

export interface CallOptions {
  deadlineMs?: number;
  idempotent?: boolean;
}

/** Клиент ts-proto (методы возвращают Observable) → методы, возвращающие Promise. */
export type PromiseClient<C> = {
  [K in keyof C]: C[K] extends (request: infer Req, ...rest: never[]) => Observable<infer Res> ? (request: Req, options?: CallOptions) => Promise<Res> : never;
};

export interface GrpcClientOptions {
  /** Имя зависимости в метриках и breaker'е (catalog, search…). */
  target: string;
  address: string;
  protoPath: string;
  package: string;
  service: string;
  defaultDeadlineMs?: number;
  /** Методы, которые безопасно повторить один раз (чтения). */
  idempotentMethods?: readonly string[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * gRPC-клиент с дедлайном из контекста запроса, передачей личности пользователя в метаданных,
 * circuit breaker'ом, одним повтором идемпотентных вызовов в рамках бюджета и метриками grpc_client_*.
 * Балансировка round_robin по всем подам headless-сервиса (dns:///catalog-headless:50052).
 */
export function createGrpcClient<C>(options: GrpcClientOptions): PromiseClient<C> & { close(): void } {
  const loaded = loadPackageDefinition(loadSync(join(PROTO_DIR, options.protoPath), PROTO_LOADER_OPTIONS));
  const Service = [...options.package.split('.'), options.service].reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], loaded) as ServiceClientConstructor;
  const client = new Service(options.address, credentials.createInsecure(), {
    'grpc.service_config': JSON.stringify({ loadBalancingConfig: [{ round_robin: {} }] }),
    'grpc.keepalive_time_ms': 30_000,
    'grpc.keepalive_timeout_ms': 5_000,
  });
  const policy = createDependencyPolicy(options.target);
  const budget = new RetryBudget();
  const idempotent = new Set(options.idempotentMethods ?? []);

  const invoke = (method: string, request: unknown, metadata: Metadata, deadline: number) =>
    new Promise<unknown>((resolve, reject) => {
      const fn = (client as unknown as Record<string, unknown>)[method];
      if (typeof fn !== 'function') return reject(new AppError('INTERNAL', `Нет метода ${options.service}.${method}`));
      (fn as (...args: unknown[]) => void).call(client, request, metadata, { deadline }, (error: ServiceError | null, response: unknown) =>
        error ? reject(error) : resolve(response),
      );
    });

  const call = async (method: string, request: unknown, callOptions: CallOptions = {}) => {
    const context = currentContext();
    const budgetMs = Math.min(remainingMs(context) ?? Number.POSITIVE_INFINITY, callOptions.deadlineMs ?? options.defaultDeadlineMs ?? 1_500);
    if (budgetMs <= 0) throw new AppError('DEADLINE_EXCEEDED', 'Не осталось времени на вызов', 'deadline');
    const deadline = Date.now() + budgetMs;
    const metadata = new Metadata();
    if (context.userId) metadata.set('x-user-id', context.userId);
    if (context.roles?.length) metadata.set('x-user-roles', context.roles.join(','));

    const stop = metrics.grpcClientHandling.startTimer({ target: options.target, grpc_method: method });
    let code = 'OK';
    try {
      return await policy.execute(async () => {
        try {
          const response = await invoke(method, request, metadata, deadline);
          budget.onSuccess();
          return response;
        } catch (error) {
          const retry = (callOptions.idempotent ?? idempotent.has(method)) && isTransient(error) && Date.now() + 50 < deadline && budget.tryAcquire();
          if (!retry) throw error;
          await sleep(25 + Math.random() * 50);
          return invoke(method, request, metadata, deadline);
        }
      });
    } catch (error) {
      const appError = toAppError(error);
      code = appError.code;
      throw appError;
    } finally {
      stop();
      metrics.grpcClientHandled.inc({ target: options.target, grpc_method: method, grpc_code: code });
    }
  };

  const base = { close: () => client.close() };
  return new Proxy(base, {
    get(target, property) {
      if (property in target) return target[property as keyof typeof target];
      // 'then' не отдаём: иначе клиент примут за thenable при возврате из async-функции
      if (typeof property !== 'string' || property === 'then') return undefined;
      return (request: unknown, callOptions?: CallOptions) => call(property, request, callOptions);
    },
  }) as unknown as PromiseClient<C> & { close(): void };
}
