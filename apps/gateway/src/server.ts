import { createHash } from 'node:crypto';
import { api, buildOpenApiDocument, type RouteSpec } from '@masterly/contracts';
import { uuidv7 } from '@masterly/kernel';
import { AppError, forbidden, HTTP_STATUS, MemoryStore, metrics, RateLimiter, runWithContext, toAppError, unauthenticated, type KeyValueStore, type Logger, type RawRecord } from '@masterly/platform';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import { ACCESS_COOKIE, parseCookies, serializeCookie, type Authenticator, type Role } from './auth.js';
import type { Backends } from './backends.js';
import { NotImplemented, ValidationProblem, type GatewaySettings, type HandlerContext, type Handlers, type RouteName } from './http.js';
import { adminHandlers } from './routes/admin.js';
import { cabinetHandlers } from './routes/cabinet.js';
import { meHandlers } from './routes/me.js';
import { publicHandlers } from './routes/public.js';
import { seoHandlers } from './routes/seo.js';
import { userHandlers } from './routes/user.js';

export type Priority = 'critical' | 'normal' | 'low';

export interface GatewayDeps {
  backends: Backends;
  auth: Pick<Authenticator, 'verify'>;
  kv: KeyValueStore;
  logger: Logger;
  settings: GatewaySettings;
  publish?: (records: RawRecord[]) => Promise<void>;
  /** Лимит одновременных запросов на под по классам приоритета. */
  limits?: Partial<Record<Priority, number>>;
}

/** Обработчики всех маршрутов контракта (сквозной тест проверяет, что не подключённых не осталось). */
export const HANDLERS: Handlers = { ...publicHandlers, ...seoHandlers, ...userHandlers, ...meHandlers, ...cabinetHandlers, ...adminHandlers };
const CRITICAL = new Set<RouteName>(['session', 'otpRequest', 'otpVerify', 'logout', 'createLead', 'lead', 'leads', 'acceptResponse', 'cancelLead', 'completeLead', 'messages', 'sendMessage', 'respondToLead', 'cabinetLeads']);
const LOW = new Set<RouteName>(['suggest', 'mapPins', 'track', 'similarMasters', 'cities', 'categories', 'services', 'brands', 'models', 'pushConfig']);
const priorityOf = (name: RouteName): Priority => (CRITICAL.has(name) ? 'critical' : LOW.has(name) ? 'low' : 'normal');
/** Бюджет времени маршрута: дедлайн уходит в grpc-timeout и уменьшается на каждом переходе. */
const budgetOf = (name: RouteName, spec: RouteSpec) => (name === 'search' || name === 'suggest' || name === 'mapPins' ? 800 : spec.method === 'GET' ? 1_500 : 2_000);
const IDEMPOTENCY_TTL_MS = 24 * 3_600_000;

/** Ограничение параллельности по классам: при перегрузке первыми отсекаются подсказки и аналитика, а не заявки. */
class Shedder {
  private readonly inFlight: Record<Priority, number> = { critical: 0, normal: 0, low: 0 };
  constructor(private readonly limits: Record<Priority, number>) {}

  acquire(priority: Priority): (() => void) | undefined {
    if (this.inFlight[priority] >= this.limits[priority]) return undefined;
    this.inFlight[priority]++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inFlight[priority]--;
    };
  }
}

function parse(schema: ZodType | undefined, value: unknown, where: string): Record<string, unknown> {
  if (!schema) return {};
  const result = schema.safeParse(value ?? {});
  if (!result.success) throw new ValidationProblem(result.error.issues.map((issue) => ({ path: [where, ...issue.path.map(String)].join('.'), message: issue.message })));
  return result.data as Record<string, unknown>;
}

function problem(reply: FastifyReply, error: unknown, traceId: string, logger: Logger): number {
  const appError = toAppError(error);
  const status = error instanceof NotImplemented ? 501 : HTTP_STATUS[appError.code];
  if (appError.code === 'INTERNAL' && !(error instanceof NotImplemented)) logger.error({ err: error, traceId }, 'ошибка обработки запроса');
  const code = appError.reason ?? appError.code.toLowerCase();
  reply
    .code(status)
    .type('application/problem+json')
    .header('cache-control', 'no-store')
    .send({ type: `https://masterly.ru/problems/${code}`, title: appError.message, status, code, traceId, ...(error instanceof ValidationProblem ? { errors: error.errors } : {}) });
  return status;
}

/**
 * Шлюз собирается из реестра контрактов: каждый маршрут проходит один и тот же конвейер —
 * перегрузка → аутентификация → RBAC → лимит → валидация → идемпотентность → дедлайн → обработчик → кэш-заголовки.
 */
export function buildGateway(deps: GatewayDeps): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024, trustProxy: true, keepAliveTimeout: 65_000, genReqId: () => uuidv7(), requestIdHeader: 'x-request-id' });
  const limiter = new RateLimiter(deps.kv);
  const localLimiter = new RateLimiter(new MemoryStore());
  const shedder = new Shedder({ critical: 1_000, normal: 800, low: 300, ...deps.limits });
  const ipHash = (ip: string) => createHash('sha256').update(`${deps.settings.analyticsSalt}:ip:${ip}`).digest('hex').slice(0, 16);

  async function handle(name: RouteName, spec: RouteSpec, request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const stop = metrics.httpDuration.startTimer({ method: spec.method, route: spec.path });
    const priority = priorityOf(name);
    const release = shedder.acquire(priority);
    const cookiesOut: string[] = [];
    let idempotencyKey: string | undefined;
    let status = 500;
    try {
      if (!release) {
        metrics.loadShed.inc({ priority });
        reply.header('retry-after', '1');
        throw new AppError('UNAVAILABLE', 'Сервис перегружен — повторите через секунду', 'overloaded');
      }

      const cookies = parseCookies(request.headers.cookie);
      const bearer = /^Bearer (.+)$/i.exec(request.headers.authorization ?? '')?.[1];
      const token = bearer ?? cookies[ACCESS_COOKIE];
      const viewer = token ? await deps.auth.verify(token) : null;
      if (spec.access !== 'public' && !viewer) throw unauthenticated();
      if (spec.access === 'master' && !viewer!.roles.includes('master')) throw forbidden('Раздел доступен мастерам');
      if (spec.access === 'admin' && !viewer!.roles.includes('admin')) throw forbidden('Раздел доступен модераторам');

      if (spec.rateLimit) {
        const key = `${name}:${viewer ? `u:${viewer.userId}` : `ip:${request.ip}`}`;
        const rule = { limit: spec.rateLimit.limit, windowMs: spec.rateLimit.windowSec * 1000 };
        const decision = await limiter.consume(key, rule).catch(() => localLimiter.consume(key, rule));
        reply.header('ratelimit-limit', String(decision.limit)).header('ratelimit-remaining', String(decision.remaining)).header('ratelimit-reset', String(Math.ceil(decision.resetMs / 1000)));
        if (!decision.allowed) {
          metrics.rateLimitRejections.inc({ route_class: priority });
          reply.header('retry-after', String(Math.max(1, Math.ceil(decision.retryAfterMs / 1000))));
          throw new AppError('RESOURCE_EXHAUSTED', 'Слишком много запросов — повторите позже', 'rate_limited');
        }
      }

      const params = parse(spec.params, request.params, 'params') as Record<string, string>;
      const query = parse(spec.query, request.query, 'query');
      const body = parse(spec.body, request.body, 'body');
      const handler = HANDLERS[name];
      if (!handler) throw new NotImplemented();

      // Идемпотентность: повтор с тем же ключом получает сохранённый ответ, параллельный — 409
      let storeKey: string | undefined;
      if (spec.idempotent) {
        idempotencyKey = String(request.headers['idempotency-key'] ?? '').trim();
        if (!idempotencyKey || idempotencyKey.length > 128) throw new AppError('INVALID_ARGUMENT', 'Нужен заголовок Idempotency-Key', 'idempotency_key_required');
        storeKey = `idem:${viewer!.userId}:${name}:${idempotencyKey}`;
        const saved = await deps.kv.get(storeKey).catch(() => null);
        if (saved) {
          const record = JSON.parse(saved.toString()) as { state: 'pending' } | { state: 'done'; status: number; body: unknown };
          if (record.state === 'pending') throw new AppError('ABORTED', 'Такой запрос уже выполняется', 'request_in_progress');
          status = record.status;
          return reply.code(record.status).header('idempotent-replayed', 'true').header('cache-control', 'no-store').send(record.body);
        }
        const claimed = await deps.kv.setIfAbsent(storeKey, JSON.stringify({ state: 'pending' }), 60_000).catch(() => true);
        if (!claimed) throw new AppError('ABORTED', 'Такой запрос уже выполняется', 'request_in_progress');
      }

      const role = (preferred?: Role): Role => preferred ?? (spec.access === 'master' ? 'master' : spec.access === 'admin' ? 'admin' : 'client');
      const ctx: HandlerContext = {
        params, query, body, viewer, backends: deps.backends, settings: deps.settings, cookies, headers: request.headers, idempotencyKey, publish: deps.publish,
        rpc: (preferred) => ({ userId: viewer?.userId ?? '', role: viewer ? role(preferred) : '', requestId: request.id, locale: 'ru', ipHash: ipHash(request.ip), masterId: viewer?.masterId ?? '', name: viewer?.name ?? '' }),
        user: () => {
          if (!viewer) throw unauthenticated();
          return viewer;
        },
        setCookie: (cookieName, value, options) => void cookiesOut.push(serializeCookie(cookieName, value, { ...options, secure: deps.settings.cookieSecure })),
      };

      let result: unknown;
      try {
        result = await runWithContext({ deadline: Date.now() + budgetOf(name, spec), userId: viewer?.userId, roles: viewer?.roles }, () => handler(ctx));
      } catch (error) {
        if (storeKey) await deps.kv.del([storeKey]).catch(() => undefined);
        throw error;
      }
      status = spec.status ?? 200;
      if (storeKey) await deps.kv.set(storeKey, JSON.stringify({ state: 'done', status, body: result }), IDEMPOTENCY_TTL_MS).catch(() => undefined);
      if (cookiesOut.length) reply.header('set-cookie', cookiesOut);
      // Публичные GET кэширует CDN; всё персональное — никогда
      reply.header('cache-control', spec.cache && spec.method === 'GET' && !viewer ? `public, max-age=0, s-maxage=${spec.cache.sMaxAge}, stale-while-revalidate=${spec.cache.swr}` : 'private, no-store');
      return reply.code(status).send(result);
    } catch (error) {
      if (cookiesOut.length) reply.header('set-cookie', cookiesOut);
      status = problem(reply, error, request.id, deps.logger);
      return reply;
    } finally {
      release?.();
      stop();
      metrics.httpRequests.inc({ method: spec.method, route: spec.path, code: String(status) });
    }
  }

  for (const [name, spec] of Object.entries(api) as Array<[RouteName, RouteSpec]>) {
    app.route({ method: spec.method, url: spec.path.replace(/\{(\w+)\}/g, ':$1'), handler: (request, reply) => handle(name, spec, request, reply) });
  }

  const openapi = buildOpenApiDocument({ title: 'Masterly API', version: '1', serverUrl: deps.settings.publicUrl });
  app.get('/openapi.json', async (_request, reply) => reply.header('cache-control', 'public, max-age=300').send(openapi));
  app.get('/docs', async (_request, reply) =>
    reply
      .type('text/html; charset=utf-8')
      .send('<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Masterly API</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><redoc spec-url="/openapi.json"></redoc><script src="https://cdn.jsdelivr.net/npm/redoc@2.1.5/bundles/redoc.standalone.js"></script></body></html>'),
  );

  app.setNotFoundHandler((request, reply) => {
    problem(reply, new AppError('NOT_FOUND', 'Маршрут не найден', 'route_not_found'), request.id, deps.logger);
  });
  app.setErrorHandler((error: { statusCode?: number; message: string; code?: string }, request, reply) => {
    // Ошибки разбора тела и протокола до конвейера (битый JSON, слишком большое тело)
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    if (status === 500) deps.logger.error({ err: error }, 'ошибка шлюза');
    reply.code(status).type('application/problem+json').send({ type: 'https://masterly.ru/problems/bad_request', title: status === 500 ? 'Внутренняя ошибка' : error.message, status, code: error.code ?? 'bad_request', traceId: request.id });
  });
  return app;
}
