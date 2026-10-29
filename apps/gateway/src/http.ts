import type { api } from '@masterly/contracts';
import { AppError } from '@masterly/platform';
import type { common } from '@masterly/proto';
import type { Backends } from './backends.js';
import type { Role, Viewer } from './auth.js';

export type RouteName = keyof typeof api;

export interface GatewaySettings {
  issuer: string;
  cookieSecure: boolean;
  analyticsSalt: string;
  publicUrl: string;
  accessTtlSec: number;
  refreshTtlSec: number;
}

/** Всё, что видит обработчик маршрута: провалидированный вход, пользователь, клиенты сервисов, куки. */
export interface HandlerContext {
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  viewer: Viewer | null;
  backends: Backends;
  settings: GatewaySettings;
  cookies: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  idempotencyKey?: string;
  /** Контекст для gRPC: пользователь, активная роль, мастерская, псевдоним IP. */
  rpc(role?: Role): common.RequestContext;
  /** То же, но требует входа (для маршрутов public с необязательным пользователем). */
  user(): Viewer;
  setCookie(name: string, value: string, options: { maxAgeSec: number; path?: string }): void;
  publish?(records: import('@masterly/platform').RawRecord[]): Promise<void>;
}

export type Handler = (ctx: HandlerContext) => Promise<unknown>;
export type Handlers = Partial<Record<RouteName, Handler>>;

/** Маршрут описан в контракте, но в живом режиме ещё не подключён к сервисам (501 вместо молчаливой ошибки). */
export class NotImplemented extends AppError {
  constructor() {
    super('INTERNAL', 'Маршрут ещё не подключён к доменным сервисам в живом режиме', 'not_implemented');
  }
}

/** Ошибка валидации входа: 400 с перечнем полей. */
export class ValidationProblem extends AppError {
  constructor(readonly errors: Array<{ path: string; message: string }>) {
    super('INVALID_ARGUMENT', 'Некорректные данные запроса', 'validation');
  }
}

export const toMinor = (rub: number | null | undefined) => (rub === null || rub === undefined ? undefined : Math.round(rub * 100));
