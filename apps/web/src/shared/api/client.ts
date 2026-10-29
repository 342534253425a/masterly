import { api, buildPath, toQueryString, type Api, type RouteInput, type RouteName, type RouteResponse, type RouteSpec } from '@masterly/contracts';
import { ApiError } from './errors';

export interface CallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  idempotencyKey?: string;
  /** SSR: пробросить cookie пользователя. Для приватных маршрутов включается автоматически. */
  withCookies?: boolean;
}

export interface TransportInit extends RequestInit {
  withCookies?: boolean;
}

export type Transport = (path: string, init: TransportInit) => Promise<Response>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Фабрика типобезопасного клиента по реестру контрактов: путь, параметры, тело и ответ
 * выводятся из @masterly/contracts, ответ валидируется той же zod-схемой, что и в шлюзе.
 * GET-запросы повторяются при сетевых ошибках и 5xx (экспоненциальная задержка + jitter).
 */
export function createApiCaller(transport: Transport) {
  return async function call<N extends RouteName>(name: N, input: RouteInput<Api[N]>, options: CallOptions = {}): Promise<RouteResponse<Api[N]>> {
    const spec = api[name] as RouteSpec;
    const { params, query, body } = input as { params?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown };
    const path = buildPath(spec.path, params) + toQueryString(query);
    const headers = new Headers({ Accept: 'application/json' });
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (spec.idempotent) headers.set('Idempotency-Key', options.idempotencyKey ?? crypto.randomUUID());
    const maxAttempts = spec.method === 'GET' ? 3 : 1;

    for (let attempt = 1; ; attempt++) {
      try {
        const signals = [AbortSignal.timeout(options.timeoutMs ?? 12_000), ...(options.signal ? [options.signal] : [])];
        const response = await transport(path, {
          method: spec.method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.any(signals),
          withCookies: options.withCookies ?? spec.access !== 'public',
        });
        if (!response.ok) {
          const problem = (await response.json().catch(() => null)) as ConstructorParameters<typeof ApiError>[1];
          throw new ApiError(response.status, problem);
        }
        const data: unknown = await response.json();
        const parsed = spec.response.safeParse(data);
        if (!parsed.success) {
          if (process.env.NODE_ENV !== 'production') console.error(`[api] ${name}: ответ не соответствует контракту`, parsed.error.issues.slice(0, 5));
          throw new ApiError(502, { title: 'Некорректный ответ сервера', code: 'contract_violation' });
        }
        return parsed.data as RouteResponse<Api[N]>;
      } catch (error) {
        const aborted = options.signal?.aborted ?? false;
        const retryable = !aborted && (error instanceof ApiError ? error.status >= 500 || error.status === 429 : true);
        if (attempt >= maxAttempts || !retryable) throw error;
        await sleep(200 * 2 ** (attempt - 1) + Math.random() * 120);
      }
    }
  };
}

/** Браузерный транспорт: /api/* обслуживает Route Handler (демо) или прокси на API Gateway. */
const browserTransport: Transport = (path, { withCookies: _ignored, ...init }) => fetch(`/api${path}`, { ...init, credentials: 'same-origin' });

/** Клиент для клиентских компонентов и React Query. В RSC используйте serverApiCall из @/shared/server. */
export const apiCall = createApiCaller(browserTransport);
