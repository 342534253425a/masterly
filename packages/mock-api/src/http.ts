import { api, type Api, type Role, type RouteName, type RouteResponse, type RouteSpec } from '@masterly/contracts';
import { http, HttpResponse, type HttpHandler, type JsonBodyType } from 'msw';
import type { z } from 'zod';
import { getDb, type DbUser } from './db.js';

export class MockHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Ресурс') => new MockHttpError(404, 'not_found', `${what} не найден`);
export const forbidden = () => new MockHttpError(403, 'forbidden', 'Недостаточно прав');
export const conflict = (message: string) => new MockHttpError(409, 'conflict', message);

const SESSION_COOKIE = 'mly_at';
const SESSION_TTL_SEC = 60 * 60 * 24 * 30;

export interface MockSession {
  user: DbUser;
  role: Role;
}

export function problem(status: number, title: string, code: string, errors?: Array<{ path: string; message: string }>): Response {
  return HttpResponse.json(
    { type: `https://masterly.dev/problems/${code}`, title, status, code, traceId: crypto.randomUUID().replaceAll('-', ''), ...(errors ? { errors } : {}) },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

const toBase64Url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (value: string) => atob(value.replace(/-/g, '+').replace(/_/g, '/'));

/** Демо-токен. В боевом контуре — короткоживущий JWT (EdDSA) + ротация refresh-токенов в identity-сервисе. */
export function sessionCookie(userId: string, role: Role): string {
  const token = toBase64Url(JSON.stringify({ uid: userId, role, iat: Date.now() }));
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}`;
}

export const clearSessionCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const index = part.indexOf('=');
      return index > 0 ? [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]] : [];
    }),
  );
}

export function readSession(request: Request): MockSession | null {
  const token = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
  if (!token) return null;
  try {
    const payload = JSON.parse(fromBase64Url(token)) as { uid: string; role: Role };
    const user = getDb().users.get(payload.uid);
    if (!user || user.status === 'blocked') return null;
    return { user, role: user.roles.includes(payload.role) ? payload.role : user.activeRole };
  } catch {
    return null;
  }
}

type SchemaOut<T, K extends string> = T extends { [P in K]: infer S extends z.ZodType } ? z.output<S> : undefined;

export interface Ctx<N extends RouteName> {
  request: Request;
  params: SchemaOut<Api[N], 'params'>;
  query: SchemaOut<Api[N], 'query'>;
  body: SchemaOut<Api[N], 'body'>;
  session: MockSession | null;
}

type Result<N extends RouteName> = RouteResponse<Api[N]> | Response;

export function requireSession(session: MockSession | null): MockSession {
  if (!session) throw new MockHttpError(401, 'unauthorized', 'Требуется вход');
  return session;
}

export function requireMaster(session: MockSession | null): { session: MockSession; masterId: string } {
  const current = requireSession(session);
  if (current.role !== 'master' || !current.user.masterId) throw forbidden();
  return { session: current, masterId: current.user.masterId };
}

const issues = (error: z.ZodError) => error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));

/**
 * Типобезопасный обработчик маршрута из реестра контрактов:
 * авторизация по роли → валидация входа → бизнес-логика → проверка ответа контрактом.
 */
export function on<N extends RouteName>(name: N, resolve: (ctx: Ctx<N>) => Result<N> | Promise<Result<N>>): HttpHandler {
  const spec = api[name] as RouteSpec;
  const method = spec.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
  const pattern = `*${spec.path.replace(/\{(\w+)\}/g, ':$1')}`;

  return http[method](pattern, async ({ request, params }): Promise<Response> => {
    try {
      const session = readSession(request);
      if (spec.access !== 'public') {
        if (!session) return problem(401, 'Требуется вход', 'unauthorized');
        if (spec.access === 'master' && session.role !== 'master') return problem(403, 'Доступно только мастерам', 'forbidden');
        if (spec.access === 'admin' && session.role !== 'admin') return problem(403, 'Доступно только администраторам', 'forbidden');
      }
      const url = new URL(request.url);
      const parsedParams = spec.params?.safeParse(params);
      if (parsedParams && !parsedParams.success) return problem(400, 'Некорректный путь', 'bad_params', issues(parsedParams.error));
      const parsedQuery = spec.query?.safeParse(Object.fromEntries(url.searchParams));
      if (parsedQuery && !parsedQuery.success) return problem(400, 'Некорректные параметры', 'bad_query', issues(parsedQuery.error));
      let body: unknown;
      if (spec.body) {
        const raw: unknown = await request.clone().json().catch(() => undefined);
        const parsedBody = spec.body.safeParse(raw);
        if (!parsedBody.success) return problem(422, 'Проверьте поля формы', 'validation_failed', issues(parsedBody.error));
        body = parsedBody.data;
      }

      const result = await resolve({ request, session, params: parsedParams?.data, query: parsedQuery?.data, body } as Ctx<N>);
      if (result instanceof Response) return result;

      const checked = spec.response.safeParse(result);
      if (!checked.success) {
        console.error(`[mock-api] ${name}: ответ нарушает контракт`, issues(checked.error).slice(0, 5));
        return problem(500, 'Ответ нарушает контракт', 'contract_violation', issues(checked.error).slice(0, 10));
      }
      return HttpResponse.json(checked.data as JsonBodyType, {
        status: spec.status ?? 200,
        headers: spec.cache ? { 'Cache-Control': `public, s-maxage=${spec.cache.sMaxAge}, stale-while-revalidate=${spec.cache.swr}` } : {},
      });
    } catch (error) {
      if (error instanceof MockHttpError) return problem(error.status, error.message, error.code);
      console.error(`[mock-api] ${name}`, error);
      return problem(500, 'Внутренняя ошибка', 'internal');
    }
  });
}

export function withCookie<T extends JsonBodyType>(body: T, cookie: string, status = 200): Response {
  return HttpResponse.json(body, { status, headers: { 'Set-Cookie': cookie } });
}
