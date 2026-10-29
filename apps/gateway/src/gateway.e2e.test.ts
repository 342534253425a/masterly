import { fileURLToPath } from 'node:url';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { api } from '@masterly/contracts';
import { DEMO_ACCOUNTS, pickDemoMaster } from '@masterly/fixtures';
import { createFieldCipher, createLogger, DEV_FIELD_KEY, ensureMonthlyUuidPartitions, loadMigrations, MemoryPubSub, OutboxRelay, type BaseConfig, type Db, type PlatformResources } from '@masterly/platform';
import { createTestDb, InMemoryEventBus, MemoryStore, startTestMicroservice } from '@masterly/platform/testing';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { AnalyticsModule } from '../../../services/analytics/src/module.js';
import { MemoryWarehouse } from '../../../services/analytics/src/warehouse.js';
import { CatalogModule } from '../../../services/catalog/src/module.js';
import { IdentityModule } from '../../../services/identity/src/module.js';
import { LeadsModule } from '../../../services/leads/src/module.js';
import { grpcContacts, grpcMatcher } from '../../../services/leads/src/ports.js';
import { MessagingModule } from '../../../services/messaging/src/module.js';
import { RealtimeServer } from '../../../services/messaging/src/realtime.js';
import { NotificationsModule } from '../../../services/notifications/src/module.js';
import { ReviewsModule } from '../../../services/reviews/src/module.js';
import { MemoryIndex } from '../../../services/search/src/index/memory-index.js';
import { SearchModule } from '../../../services/search/src/module.js';
import { TrustModule } from '../../../services/trust/src/module.js';
import { Authenticator } from './auth.js';
import { createBackends } from './backends.js';
import { buildGateway, HANDLERS } from './server.js';

/**
 * Сквозной сценарий через шлюз на настоящих сервисах: NestJS + gRPC + PostgreSQL (PGlite) + outbox → шина событий.
 * Каждый ответ шлюза проверяется схемой маршрута из @masterly/contracts — той же, по которой работает фронтенд.
 */
const demo = pickDemoMaster();
const migrations = (service: string) => loadMigrations(fileURLToPath(new URL(`../../../services/${service}/migrations`, import.meta.url)));
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe('шлюз + доменные сервисы (e2e)', () => {
  const bus = new InMemoryEventBus();
  const kv = new MemoryStore();
  const pubsub = new MemoryPubSub();
  const codes = new Map<string, string>();
  const sessions = new Map<string, string>();
  const relays: OutboxRelay[] = [];
  const closers: Array<() => Promise<unknown>> = [];
  let backends: ReturnType<typeof createBackends>;
  let app: FastifyInstance;
  let realtimeUrl: string;

  async function resources(service: string, db?: Db): Promise<PlatformResources> {
    const logger = createLogger({ service, level: 'silent' });
    if (db) relays.push(new OutboxRelay(db, bus, logger));
    return { config: { SERVICE_NAME: service, NODE_ENV: 'test', LOG_LEVEL: 'silent' } as BaseConfig, logger, db, bus, kv, pubsub };
  }

  async function start(module: Parameters<typeof startTestMicroservice>[0], protoPath: string, pkg: string): Promise<string> {
    const server = await startTestMicroservice(module, { package: pkg, protoPath });
    closers.push(server.close);
    return server.address;
  }

  /** Доставить всё: outbox каждого сервиса → шина → подписчики, пока события не перестанут порождать новые. */
  async function pump(): Promise<void> {
    for (let round = 0; round < 20; round++) {
      let moved = 0;
      for (const relay of relays) for (let n = await relay.tick(); n > 0; n = await relay.tick()) moved += n;
      moved += await bus.drain();
      if (moved === 0) return;
    }
  }

  async function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, options: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    const response = await app.inject({
      method,
      url,
      headers: { ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}), ...options.headers },
      payload: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const json = response.headers['content-type']?.toString().includes('json') ? response.json() : undefined;
    return { status: response.statusCode, body: json, headers: response.headers };
  }

  /** Вход по коду — один раз на номер (повторный запрос кода в течение минуты identity отклоняет). */
  async function login(phone: string): Promise<string> {
    const cached = sessions.get(phone);
    if (cached) return cached;
    await kv.del(['rl:otpRequest:ip:127.0.0.1', 'rl:otpVerify:ip:127.0.0.1']);
    const challenge = await call('POST', '/v1/auth/otp', { body: { phone } });
    expect(challenge.status).toBe(200);
    const verified = await call('POST', '/v1/auth/otp/verify', { body: { requestId: challenge.body.requestId, code: codes.get(phone) } });
    expect(verified.status).toBe(200);
    api.otpVerify.response.parse(verified.body);
    const cookies = ([] as string[]).concat(verified.headers['set-cookie'] ?? []);
    const cookie = cookies.map((item) => item.split(';')[0]).join('; ');
    sessions.set(phone, cookie);
    return cookie;
  }

  /** Живой канал вкладки: WebSocket messaging с cookie сессии; копит полученные сигналы. */
  async function live(cookie: string): Promise<Array<{ type: string; conversationId?: string; kind?: string }>> {
    const ws = new WebSocket(realtimeUrl, { headers: { cookie, origin: 'http://gateway.test' } });
    const signals: Array<{ type: string; conversationId?: string; kind?: string }> = [];
    ws.on('message', (data) => signals.push(JSON.parse(String(data)) as (typeof signals)[number]));
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    closers.push(async () => ws.terminate());
    return signals;
  }

  async function until(check: () => boolean, timeoutMs = 3_000): Promise<void> {
    for (const deadline = Date.now() + timeoutMs; !check(); await new Promise((resolve) => setTimeout(resolve, 10))) {
      if (Date.now() > deadline) throw new Error('условие не выполнилось вовремя');
    }
  }

  beforeAll(async () => {
    const cipher = createFieldCipher(DEV_FIELD_KEY);
    const identityDb = await createTestDb({ migrations: await migrations('identity') });
    const catalogDb = await createTestDb({ migrations: await migrations('catalog'), extensions: { pg_trgm } });
    const leadsDb = await createTestDb({ migrations: await migrations('leads') });
    await ensureMonthlyUuidPartitions(leadsDb, ['leads', 'lead_recipients']);
    const reviewsDb = await createTestDb({ migrations: await migrations('reviews') });
    const messagingDb = await createTestDb({ migrations: await migrations('messaging') });
    await ensureMonthlyUuidPartitions(messagingDb, ['messages']);
    const notificationsDb = await createTestDb({ migrations: await migrations('notifications') });
    const trustDb = await createTestDb({ migrations: await migrations('trust') });

    const noAck = async () => undefined;
    const identity = await start(
      IdentityModule.register(await resources('identity', identityDb), {
        cipher,
        sms: { send: async (phone, text) => void codes.set(phone, /(\d{6})/.exec(text)![1]!) },
        settings: { issuer: 'https://id.test', accessTtlSec: 900, refreshTtlSec: 3600, retentionDays: 1095 },
        seedDemo: true,
      }),
      'masterly/identity/v1/identity.proto',
      'masterly.identity.v1',
    );
    const catalog = await start(CatalogModule.register(await resources('catalog', catalogDb), { cipher, erasureAck: noAck, seedDemo: true }), 'masterly/catalog/v1/catalog.proto', 'masterly.catalog.v1');
    const search = await start(SearchModule.register(await resources('search'), { index: new MemoryIndex() }), 'masterly/search/v1/search.proto', 'masterly.search.v1');
    const leads = await start(
      LeadsModule.register(await resources('leads', leadsDb), { matcher: grpcMatcher(search), contacts: grpcContacts(catalog), erasureAck: noAck }),
      'masterly/leads/v1/leads.proto',
      'masterly.leads.v1',
    );
    const reviews = await start(ReviewsModule.register(await resources('reviews', reviewsDb), { erasureAck: noAck }), 'masterly/reviews/v1/reviews.proto', 'masterly.reviews.v1');
    const messaging = await start(MessagingModule.register(await resources('messaging', messagingDb), { erasureAck: noAck }), 'masterly/messaging/v1/messaging.proto', 'masterly.messaging.v1');
    const platformProto = ['masterly/platform/v1/platform.proto', 'masterly.platform.v1'] as const;
    const notifications = await start(NotificationsModule.register(await resources('notifications', notificationsDb), { sender: { send: async () => undefined }, erasureAck: noAck }), ...platformProto);
    // Аналитика пишет в хранилище в памяти без задержки пакета: цифры кабинета и админки проверяются по-настоящему
    const analytics = await start(AnalyticsModule.register(await resources('analytics'), { warehouse: new MemoryWarehouse(), salt: 'masterly', erasureAck: noAck, batchDelayMs: 0 }), ...platformProto);
    const trust = await start(TrustModule.register(await resources('trust', trustDb), { erasureAck: noAck }), ...platformProto);

    backends = createBackends({ identity, catalog, search, leads, reviews, messaging, notifications, media: '127.0.0.1:1', analytics, trust });
    closers.push(async () => backends.close());
    const auth = new Authenticator(backends.identity, 'https://id.test');
    app = buildGateway({
      backends,
      auth,
      kv,
      logger: createLogger({ service: 'gateway', level: 'silent' }),
      publish: (records) => bus.publish(records),
      settings: { issuer: 'https://id.test', cookieSecure: false, analyticsSalt: 'test', publicUrl: 'http://gateway.test', accessTtlSec: 900, refreshTtlSec: 3600 },
    });
    await app.ready();
    // WebSocket чата (в проде — порт 8081 подов messaging): те же JWT identity и общий pub/sub
    const realtime = new RealtimeServer({ port: 0, path: '/ws', allowedOrigins: ['http://gateway.test'], verify: (token) => auth.verify(token), pubsub, logger: createLogger({ service: 'realtime', level: 'silent' }) });
    realtimeUrl = `ws://127.0.0.1:${await realtime.start()}/ws`;
    closers.push(() => realtime.close());
    await pump(); // сид каталога → снимки → индекс поиска
  });

  afterAll(async () => {
    await app?.close();
    for (const close of closers.reverse()) await close().catch(() => undefined);
  });

  it('справочники и поиск по проблеме — по контракту', async () => {
    const cities = await call('GET', '/v1/cities');
    expect(api.cities.response.parse(cities.body).find((city) => city.id === 'msk')!.mastersCount).toBeGreaterThan(10);
    expect(cities.headers['cache-control']).toContain('s-maxage');

    const services = await call('GET', '/v1/catalog/services?city=moskva');
    expect(api.services.response.parse(services.body).find((service) => service.id === 'display')!.mastersCount).toBeGreaterThan(0);
    expect(api.categories.response.parse((await call('GET', '/v1/catalog/categories')).body).find((category) => category.id === 'smartphones')!.status).toBe('active');

    const found = await call('GET', `/v1/search?city=moskva&q=${encodeURIComponent('разбил экран айфон 13')}&limit=10`);
    expect(found.status).toBe(200);
    const result = api.search.response.parse(found.body);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.interpretation?.model?.id).toBe('iphone-13');
    expect(result.items.every((item) => item.price?.serviceId === 'display')).toBe(true);

    api.suggest.response.parse((await call('GET', `/v1/search/suggest?q=${encodeURIComponent('замена')}&city=moskva`)).body);
    const pins = api.mapPins.response.parse((await call('GET', '/v1/search/map?city=moskva&service=zamena-displeya')).body);
    expect(pins.pins.length).toBeGreaterThan(0);

    const profile = await call('GET', `/v1/masters/${demo.slug}`);
    expect(api.master.response.parse(profile.body)).toMatchObject({ id: demo.id, slug: demo.slug });
    expect((await call('GET', '/v1/masters/net-takogo-mastera')).status).toBe(404);
  });

  it('ошибки — problem+json: вход, демо-вход, валидация, неизвестный маршрут, битый идентификатор', async () => {
    const anonymous = await call('GET', '/v1/leads');
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers['content-type']).toContain('application/problem+json');
    expect(anonymous.body).toMatchObject({ status: 401, code: 'unauthenticated' });

    expect((await call('POST', '/v1/auth/demo', { body: { role: 'admin' } })).status).toBe(404);
    expect((await call('GET', '/v1/nothing-here')).body).toMatchObject({ code: 'route_not_found' });

    const invalid = await call('GET', '/v1/search?limit=500');
    expect(invalid.status).toBe(400);
    expect(invalid.body.errors[0].path).toBe('query.limit');

    // Не-UUID в адресе — «не найдено» или «некорректный ввод», но не 500 из PostgreSQL
    expect((await call('GET', '/v1/masters/net-takogo/similar')).status).toBe(404);
    expect((await call('GET', '/v1/masters/net-takogo/reviews')).status).toBe(400);

    expect((await call('GET', '/openapi.json')).body.openapi).toBe('3.1.0');
  });

  it('полный цикл заявки: клиент → мастер → выбор → выполнение → отзыв', async () => {
    const client = await login(DEMO_ACCOUNTS.client.phone);
    const session = api.session.response.parse((await call('GET', '/v1/auth/session', { cookie: client })).body);
    expect(session.user).toMatchObject({ id: DEMO_ACCOUNTS.client.id, activeRole: 'client' });

    const draft = { masterIds: [demo.id], cityId: 'msk', serviceId: 'display', modelId: 'iphone-13', description: 'Разбил экран, сенсор работает частично', urgency: 'today', visitType: 'workshop', preferredChannel: 'chat', sharePhone: false };
    expect((await call('POST', '/v1/leads', { cookie: client, body: draft })).body).toMatchObject({ code: 'idempotency_key_required' });
    const created = await call('POST', '/v1/leads', { cookie: client, body: draft, headers: { 'idempotency-key': 'lead-1' } });
    expect(created.status).toBe(201);
    const lead = api.createLead.response.parse(created.body);
    expect(lead.recipients.map((r) => r.master.id)).toEqual([demo.id]);
    const replay = await call('POST', '/v1/leads', { cookie: client, body: draft, headers: { 'idempotency-key': 'lead-1' } });
    expect(replay.body.id).toBe(lead.id);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    await pump();

    // Мастер видит заявку в кабинете (с числом заявок клиента) и отвечает; вкладка мастера держит живой канал
    const master = await login(DEMO_ACCOUNTS.master.phone);
    const masterTab = await live(master);
    await until(() => masterTab.some((signal) => signal.type === 'ready'));
    expect((await call('GET', '/v1/cabinet/leads', { cookie: client })).status).toBe(403);
    const inbox = api.cabinetLeads.response.parse((await call('GET', '/v1/cabinet/leads', { cookie: master })).body);
    expect(inbox.find((item) => item.id === lead.id)!.client.leadsCount).toBe(1);
    const responded = await call('POST', `/v1/cabinet/leads/${lead.id}/respond`, { cookie: master, body: { priceFrom: 4500, priceTo: 6500, message: 'Оригинальный дисплей, за час', etaMin: 60 }, headers: { 'idempotency-key': 'respond-1' } });
    expect(api.respondToLead.response.parse(responded.body).myResponse?.price).toEqual({ from: 4500, to: 6500 });
    await pump();

    // Клиент выбирает мастера, тот берёт заявку в работу, клиент подтверждает выполнение
    const withResponse = api.lead.response.parse((await call('GET', `/v1/leads/${lead.id}`, { cookie: client })).body);
    expect(withResponse.status).toBe('responded');
    const accepted = api.acceptResponse.response.parse((await call('POST', `/v1/leads/${lead.id}/responses/${withResponse.responses[0]!.id}/accept`, { cookie: client })).body);
    expect(accepted).toMatchObject({ status: 'accepted', master: { id: demo.id } });
    api.setLeadStatus.response.parse((await call('POST', `/v1/cabinet/leads/${lead.id}/status`, { cookie: master, body: { status: 'in_progress' } })).body);
    const completed = api.completeLead.response.parse((await call('POST', `/v1/leads/${lead.id}/complete`, { cookie: client })).body);
    expect(completed).toMatchObject({ status: 'completed', canReview: true });
    // «Просмотрено» фиксируется при открытии заявки; мастер ответил прямо из списка кабинета
    expect(completed.timeline.map((event) => event.type)).toEqual(['created', 'responded', 'accepted', 'started', 'completed']);
    await pump();

    // Отзыв возможен только после выполнения; рейтинг пересчитывается и доходит до профиля
    const reviewed = await call('POST', '/v1/reviews', { cookie: client, body: { leadId: lead.id, rating: 5, text: 'Заменили экран за час, всё работает идеально' }, headers: { 'idempotency-key': 'review-1' } });
    expect(reviewed.status).toBe(201);
    api.createReview.response.parse(reviewed.body);
    await pump();
    const reviews = api.masterReviews.response.parse((await call('GET', `/v1/masters/${demo.id}/reviews`)).body);
    expect(reviews).toMatchObject({ total: 1, rating: 5, distribution: [0, 0, 0, 0, 1] });
    expect(api.master.response.parse((await call('GET', `/v1/masters/${demo.slug}`)).body)).toMatchObject({ rating: 5, reviewsCount: 1 });
    expect(api.cabinetReviews.response.parse((await call('GET', '/v1/cabinet/reviews', { cookie: master })).body)).toHaveLength(1);

    // Диалог по заявке открылся автоматически; переписка и уведомления
    const conversations = api.conversations.response.parse((await call('GET', '/v1/conversations', { cookie: client })).body);
    const dialog = conversations.find((item) => item.leadId === lead.id)!;
    expect(dialog.peer).toMatchObject({ id: demo.id, kind: 'master' });
    const sent = await call('POST', `/v1/conversations/${dialog.id}/messages`, { cookie: client, body: { text: 'Спасибо!', clientId: 'msg-00000001' } });
    expect(sent.status).toBe(201);
    // Живая доставка: сигнал о сообщении клиента приходит во вкладку мастера, системные (ответ, выбор, работа, выполнение) — тоже
    await until(() => masterTab.some((signal) => signal.conversationId === dialog.id && signal.kind === 'text'));
    expect(masterTab.filter((signal) => signal.conversationId === dialog.id && signal.kind === 'system').length).toBeGreaterThanOrEqual(4);
    const thread = api.messages.response.parse((await call('GET', `/v1/conversations/${dialog.id}/messages`, { cookie: master })).body);
    expect(thread.items.at(-1)).toMatchObject({ text: 'Спасибо!', fromMe: false });
    await pump();
    const notifications = api.notifications.response.parse((await call('GET', '/v1/me/notifications', { cookie: client })).body);
    expect(notifications.map((item) => item.kind)).toContain('lead');
  });

  it('SEO и сравнение: похожие мастера, сравнение предложений, посадочная страница, push-ключ', async () => {
    const similar = api.similarMasters.response.parse((await call('GET', `/v1/masters/${demo.id}/similar`)).body);
    expect(similar.length).toBeGreaterThan(0);
    expect(similar.every((card) => card.id !== demo.id && card.cityId === demo.cityId && card.promoted === null)).toBe(true);

    const ids = [demo.id, ...similar.slice(0, 2).map((card) => card.id)];
    const compared = api.compare.response.parse((await call('GET', `/v1/compare?ids=${ids.join(',')}&service=zamena-displeya&model=iphone-13`)).body);
    expect(compared.items.map((item) => item.id)).toEqual(ids);
    expect(compared).toMatchObject({ service: { id: 'display' }, model: { id: 'iphone-13' } });
    expect(compared.items[0]!.offer?.modelPrice?.from).toBeGreaterThan(0);
    expect(ids).toContain(compared.best.rating);

    const landing = api.landing.response.parse((await call('GET', '/v1/seo/landing?city=moskva&service=zamena-displeya')).body);
    expect(landing).toMatchObject({ city: { id: 'msk' }, service: { id: 'display' }, model: null });
    expect(landing.topMasters.length).toBeGreaterThan(0);
    expect(landing.stats.priceFrom).toBeGreaterThan(0);
    expect(landing.stats.priceMedian).toBeGreaterThanOrEqual(landing.stats.priceFrom);
    expect(landing.faq[0]!.q).toContain('в Москве');
    expect(landing.related).toContainEqual(expect.objectContaining({ city: 'sankt-peterburg', service: 'zamena-displeya' }));
    expect(landing.related.some((link) => link.city === 'moskva' && link.service === 'zamena-displeya')).toBe(false);
    const forModel = api.landing.response.parse((await call('GET', '/v1/seo/landing?city=moskva&service=zamena-displeya&model=iphone-13')).body);
    expect(forModel.model).toMatchObject({ id: 'iphone-13' });
    expect(forModel.stats.priceFrom).toBeGreaterThan(0);
    expect((await call('GET', '/v1/seo/landing?city=atlantida')).status).toBe(404);
    expect((await call('GET', '/v1/seo/landing?city=moskva&service=net-takoy-uslugi')).status).toBe(404);

    // VAPID-ключ в тестовом окружении не задан — push выключен, фронтенд не предлагает подписку
    expect(api.pushConfig.response.parse((await call('GET', '/v1/push/config')).body)).toEqual({ enabled: false, publicKey: null });
  });

  it('личный кабинет клиента: настройки, избранное, экспорт данных, жалоба, push-подписка', async () => {
    const client = await login(DEMO_ACCOUNTS.client.phone);
    const initial = api.settings.response.parse((await call('GET', '/v1/me/settings', { cookie: client })).body);
    // Каналы — из сервиса notifications: о новой заявке по умолчанию сообщаем push и письмом
    expect(initial.notifications.leads).toEqual(['push', 'email']);

    const patch = {
      theme: 'dark',
      notifications: { ...initial.notifications, leads: ['push', 'telegram'] },
      quietHours: { enabled: false, start: '23:00', end: '07:00' },
      consents: { ...initial.consents, marketing: !initial.consents.marketing },
    };
    const updated = api.updateSettings.response.parse((await call('PATCH', '/v1/me/settings', { cookie: client, body: patch })).body);
    expect(updated).toMatchObject({ theme: 'dark', quietHours: patch.quietHours, consents: patch.consents });
    expect(updated.notifications.leads).toEqual(['push', 'telegram']);
    expect(api.settings.response.parse((await call('GET', '/v1/me/settings', { cookie: client })).body)).toEqual(updated);
    expect((await call('PATCH', '/v1/me/settings', { cookie: client, body: { quietHours: { enabled: true, start: '25:00', end: '07:00' } } })).body).toMatchObject({ status: 400, code: 'invalid_quiet_hours' });

    expect((await call('PUT', `/v1/me/favorites/${demo.id}`, { cookie: client })).body).toEqual({ ok: true });
    expect((await call('PUT', '/v1/me/favorites/net-takogo', { cookie: client })).status).toBe(404);
    expect(api.favorites.response.parse((await call('GET', '/v1/me/favorites', { cookie: client })).body).map((card) => card.id)).toEqual([demo.id]);

    // Экспорт ПДн собирается из сервисов-владельцев: профиль, настройки, избранное, заявки, отзывы, журнал согласий
    const exported = api.exportData.response.parse((await call('POST', '/v1/me/export', { cookie: client })).body);
    expect(exported).toMatchObject({ format: 'masterly.personal-data.v1', user: { id: DEMO_ACCOUNTS.client.id }, favorites: [demo.id], settings: { theme: 'dark' } });
    expect(exported.leads).toHaveLength(1);
    expect(exported.reviews).toHaveLength(1);
    expect(exported.consentLog).toContainEqual(expect.objectContaining({ consent: 'marketing', granted: patch.consents.marketing }));

    expect((await call('DELETE', `/v1/me/favorites/${demo.id}`, { cookie: client })).body).toEqual({ ok: true });
    expect((await call('GET', '/v1/me/favorites', { cookie: client })).body).toEqual([]);

    const report = await call('POST', '/v1/reports', { cookie: client, body: { subjectType: 'master', subjectId: demo.id, reason: 'fake', note: 'Фото работ взяты из интернета' } });
    expect(report.status).toBe(202);
    api.createReport.response.parse(report.body);

    const subscription = { endpoint: 'https://push.example.com/send/abc', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA', auth: 'tBHItJI5svbpez7KI4CCXg' } };
    expect((await call('PUT', '/v1/me/push-subscription', { cookie: client, body: subscription })).body).toEqual({ ok: true });
    expect((await call('DELETE', `/v1/me/push-subscription?endpoint=${encodeURIComponent(subscription.endpoint)}`, { cookie: client })).body).toEqual({ ok: true });
    expect((await call('PUT', '/v1/me/push-subscription', { cookie: client, body: { ...subscription, endpoint: 'http://push.example.com/insecure' } })).body).toMatchObject({ status: 400, code: 'invalid_subscription' });
  });

  it('кабинет мастера: сводка, статистика, цены, график, счёт → оплата → Pro, команда', async () => {
    const master = await login(DEMO_ACCOUNTS.master.phone);
    const overview = api.cabinetOverview.response.parse((await call('GET', '/v1/cabinet/overview', { cookie: master })).body);
    expect(overview.master.id).toBe(demo.id);
    // Заявка из сценария выше дошла до аналитики (leads → событие → хранилище) и до воронки
    expect(overview.kpis.find((kpi) => kpi.key === 'leads')!.value).toBe(1);
    expect(overview.funnel.find((stage) => stage.stage === 'completed')!.value).toBe(1);
    expect(overview.topServices).toEqual([{ serviceId: 'display', name: 'Замена дисплея', leads: 1, share: 1 }]);
    expect(overview.recentLeads[0]!.client.leadsCount).toBe(1);
    expect(overview.unansweredReviews).toBe(1);
    for (const period of ['7d', '30d', '90d'] as const) {
      const analytics = api.cabinetAnalytics.response.parse((await call('GET', `/v1/cabinet/analytics?period=${period}`, { cookie: master })).body);
      expect(analytics.series).toHaveLength(Number.parseInt(period, 10));
    }

    // Цены: правка одной услуги не теряет остальные (UpsertOffers заменяет набор целиком)
    const offers = api.cabinetOffers.response.parse((await call('GET', '/v1/cabinet/offers', { cookie: master })).body);
    const display = offers.find((offer) => offer.serviceId === 'display')!;
    expect(display.enabled).toBe(true);
    expect(display.marketMedian).toBeGreaterThan(0);
    const { marketMedian: _median, ...editable } = display;
    const repriced = api.updateCabinetOffers.response.parse((await call('PUT', '/v1/cabinet/offers', { cookie: master, body: { offers: [{ ...editable, priceFrom: display.priceFrom + 500, priceTo: display.priceTo + 500 }] } })).body);
    expect(repriced.find((offer) => offer.serviceId === 'display')!.priceFrom).toBe(display.priceFrom + 500);
    expect(repriced.filter((offer) => offer.enabled).length).toBe(offers.filter((offer) => offer.enabled).length);

    const schedule = api.cabinetSchedule.response.parse((await call('GET', '/v1/cabinet/schedule', { cookie: master })).body);
    const { timezone: _timezone, ...current } = schedule;
    const vacation = { from: inDays(10), to: inDays(17) };
    const saved = api.updateCabinetSchedule.response.parse((await call('PUT', '/v1/cabinet/schedule', { cookie: master, body: { ...current, vacation, zone: { ...current.zone, radiusKm: 7 } } })).body);
    expect(saved).toMatchObject({ vacation, zone: { radiusKm: 7 }, schedule: schedule.schedule, acceptingLeads: schedule.acceptingLeads });
    expect((await call('PUT', '/v1/cabinet/schedule', { cookie: master, body: { ...current, vacation: { from: inDays(5), to: inDays(1) } } })).body).toMatchObject({ code: 'invalid_vacation' });

    // Платные функции — только по внешнему счёту; «оплачен» отмечает интеграция с бухгалтерией (gRPC catalog)
    const billing = api.cabinetBilling.response.parse((await call('GET', '/v1/cabinet/billing', { cookie: master })).body);
    expect(billing).toMatchObject({ plan: 'free', planUntil: null, invoices: [] });
    const invoiceBody = { product: 'pro_month', payer: 'ИП Морозов Алексей', inn: '7701234567', email: 'buh@example.com' };
    expect((await call('POST', '/v1/cabinet/billing/invoices', { cookie: master, body: invoiceBody })).body).toMatchObject({ code: 'idempotency_key_required' });
    const issued = await call('POST', '/v1/cabinet/billing/invoices', { cookie: master, body: invoiceBody, headers: { 'idempotency-key': 'invoice-1' } });
    expect(issued.status).toBe(201);
    const invoice = api.requestInvoice.response.parse(issued.body);
    expect(invoice).toMatchObject({ product: 'pro_month', amount: 2490, status: 'issued' });
    await backends.catalog.markInvoicePaid({ invoiceId: invoice.id });
    const paid = api.cabinetBilling.response.parse((await call('GET', '/v1/cabinet/billing', { cookie: master })).body);
    expect(paid).toMatchObject({ plan: 'pro', invoices: [{ id: invoice.id, status: 'paid' }] });
    expect(Date.parse(paid.planUntil!)).toBeGreaterThan(Date.now() + 29 * 86_400_000);

    // На Pro — 10 мест в команде: приглашение и удаление; владельца удалить нельзя
    const team = api.cabinetTeam.response.parse((await call('GET', '/v1/cabinet/team', { cookie: master })).body);
    expect(team.seats).toEqual({ used: 3, limit: 10 });
    expect((await call('POST', '/v1/cabinet/team/staff', { cookie: master, body: { name: 'Олег Сидоров', phone: '+79035550101', role: 'master', branchId: 'net-filiala' } })).body).toMatchObject({ code: 'unknown_branch' });
    const invited = await call('POST', '/v1/cabinet/team/staff', { cookie: master, body: { name: 'Олег Сидоров', phone: '+79035550101', role: 'master', branchId: null } });
    expect(invited.status).toBe(201);
    const grown = api.inviteStaff.response.parse(invited.body);
    expect(grown.seats.used).toBe(4);
    expect(JSON.stringify(grown)).not.toContain('79035550101');
    const added = grown.staff.find((member) => member.name === 'Олег Сидоров')!;
    expect(api.removeStaff.response.parse((await call('DELETE', `/v1/cabinet/team/staff/${added.id}`, { cookie: master })).body).seats.used).toBe(3);
    const owner = team.staff.find((member) => member.role === 'owner')!;
    expect((await call('DELETE', `/v1/cabinet/team/staff/${owner.id}`, { cookie: master })).body).toMatchObject({ status: 409, code: 'owner_protected' });
  });

  it('админка: сводка, каталог услуг и вертикалей, пользователи и роли', async () => {
    const admin = await login(DEMO_ACCOUNTS.admin.phone);
    const client = await login(DEMO_ACCOUNTS.client.phone);
    expect((await call('GET', '/v1/admin/overview', { cookie: client })).status).toBe(403);

    const overview = api.adminOverview.response.parse((await call('GET', '/v1/admin/overview', { cookie: admin })).body);
    expect(overview.kpis.find((kpi) => kpi.key === 'masters')!.value).toBeGreaterThan(10);
    expect(overview.searches).toHaveLength(14);
    // Поиск пользователя из первого сценария посчитан, служебные запросы шлюза (счётчики городов) — нет
    expect(overview.searches.at(-1)!.total).toBe(1);
    expect(overview.leadsByCity.find((city) => city.cityId === 'msk')!.leads).toBe(1);
    expect(overview.moderation.pending).toBeGreaterThanOrEqual(1);
    expect(overview.topCategories[0]).toMatchObject({ id: 'display' });

    // Услуга, выключенная админкой, пропадает из публичного каталога и не подключается мастерами
    const services = api.adminServices.response.parse((await call('GET', '/v1/admin/catalog/services', { cookie: admin })).body);
    expect(services.find((service) => service.id === 'display')!.searches30d).toBeGreaterThanOrEqual(1);
    expect(api.updateAdminService.response.parse((await call('PATCH', '/v1/admin/catalog/services/water', { cookie: admin, body: { enabled: false, name: 'Ремонт после попадания воды' } })).body)).toMatchObject({ id: 'water', enabled: false, name: 'Ремонт после попадания воды' });
    expect(api.services.response.parse((await call('GET', '/v1/catalog/services?city=moskva')).body).map((service) => service.id)).not.toContain('water');
    const master = await login(DEMO_ACCOUNTS.master.phone);
    const offers = api.cabinetOffers.response.parse((await call('GET', '/v1/cabinet/offers', { cookie: master })).body);
    expect(offers.map((offer) => offer.serviceId)).not.toContain('water');
    expect((await call('PUT', '/v1/cabinet/offers', { cookie: master, body: { offers: [{ serviceId: 'water', enabled: true, priceFrom: 1000, priceTo: 2000, durationMin: 60, warrantyDays: 30, parts: [] }] } })).body).toMatchObject({ code: 'service_unavailable' });
    expect(api.updateAdminService.response.parse((await call('PATCH', '/v1/admin/catalog/services/water', { cookie: admin, body: { enabled: true } })).body).enabled).toBe(true);

    const categories = api.adminCategories.response.parse((await call('GET', '/v1/admin/catalog/categories', { cookie: admin })).body);
    expect(categories.find((category) => category.id === 'smartphones')!.masters).toBeGreaterThan(10);
    expect(api.updateCategory.response.parse((await call('PATCH', '/v1/admin/catalog/categories/laptops', { cookie: admin, body: { status: 'active' } })).body)).toMatchObject({ id: 'laptops', status: 'active' });
    expect(api.categories.response.parse((await call('GET', '/v1/catalog/categories')).body).find((category) => category.id === 'laptops')!.status).toBe('active');
    await call('PATCH', '/v1/admin/catalog/categories/laptops', { cookie: admin, body: { status: 'soon' } });

    // Пользователи: поиск по телефону, число заявок, роли; себя администратор не блокирует
    const found = api.adminUsers.response.parse((await call('GET', `/v1/admin/users?q=${encodeURIComponent(DEMO_ACCOUNTS.client.phone)}`, { cookie: admin })).body);
    expect(found).toEqual([expect.objectContaining({ id: DEMO_ACCOUNTS.client.id, status: 'active', leadsCount: 1 })]);
    expect(api.updateAdminUser.response.parse((await call('PATCH', `/v1/admin/users/${DEMO_ACCOUNTS.client.id}`, { cookie: admin, body: { roles: ['client', 'admin'] } })).body).roles).toEqual(['client', 'admin']);
    expect(api.updateAdminUser.response.parse((await call('PATCH', `/v1/admin/users/${DEMO_ACCOUNTS.client.id}`, { cookie: admin, body: { roles: ['client'] } })).body).roles).toEqual(['client']);
    expect((await call('PATCH', `/v1/admin/users/${DEMO_ACCOUNTS.admin.id}`, { cookie: admin, body: { status: 'blocked' } })).body).toMatchObject({ status: 409, code: 'self_lockout' });
  });

  it('лимит запросов кода; все маршруты контракта подключены к сервисам', async () => {
    await kv.del(['rl:otpRequest:ip:127.0.0.1']);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await call('POST', '/v1/auth/otp', { body: { phone: `+7926555440${i}` } })).status);
    expect(statuses).toContain(429);
    const limited = await call('POST', '/v1/auth/otp', { body: { phone: '+79265554409' } });
    expect(limited.headers['retry-after']).toBeDefined();

    expect(Object.keys(api).filter((name) => !(name in HANDLERS))).toEqual([]);
  });

  it('выход: refresh-сессия отозвана, тихое обновление больше не работает', async () => {
    const client = await login(DEMO_ACCOUNTS.client.phone);
    expect(api.logout.response.parse((await call('POST', '/v1/auth/logout', { cookie: client })).body)).toEqual({ ok: true });
    const refreshOnly = client.split('; ').find((cookie) => cookie.startsWith('mly_rt='))!;
    expect(api.session.response.parse((await call('GET', '/v1/auth/session', { cookie: refreshOnly })).body)).toEqual({ user: null, demo: false });
  });
});
