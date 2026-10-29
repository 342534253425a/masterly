import { join } from 'node:path';
import { loadPackageDefinition, Metadata, Server, ServerCredentials, status, type sendUnaryData, type ServerUnaryCall } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { PROTO_DIR, type catalog } from '@masterly/proto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JwtVerifier, parseCookies } from './auth/jwt.js';
import { jsonCodec, ReadThroughCache } from './cache/cache.js';
import { MemoryStore } from './cache/kv.js';
import { RateLimiter } from './cache/rate-limit.js';
import { runWithContext } from './context.js';
import type { Db } from './db/db.js';
import { migrate } from './db/migrate.js';
import { AppError, fromGrpcError, toAppError, toGrpcError } from './errors.js';
import { decodeEvent, encodeEvent } from './events/codec.js';
import { processOnce } from './events/inbox.js';
import { enqueue, maintainOutbox, OutboxRelay } from './events/outbox.js';
import { createGrpcClient, PROTO_LOADER_OPTIONS } from './grpc/client.js';
import { createLogger } from './logger.js';
import { MemoryPubSub } from './realtime/pubsub.js';
import { createTestDb, InMemoryEventBus } from './testing.js';

const logger = createLogger({ service: 'test', level: 'silent' });

describe('миграции и outbox на настоящем PostgreSQL (PGlite)', () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(() => db.close());

  it('миграции идемпотентны', async () => {
    const service = [{ name: '0001_items.sql', sql: 'CREATE TABLE items (id uuid PRIMARY KEY, title text NOT NULL);' }];
    expect(await migrate(db, service)).toEqual(['0000_platform_outbox_inbox.sql', '0001_items.sql']);
    expect(await migrate(db, service)).toEqual([]);
  });

  it('события из откатившейся транзакции не публикуются, остальные — по порядку внутри ключа', async () => {
    const lead = (id: string, status: string) => ({
      type: 'leads.lead.status_changed.v1' as const,
      key: id,
      payload: { leadId: id, masterId: 'm1', clientId: 'c1', fromStatus: 'open', toStatus: status, actor: 'client', at: '2026-10-28T10:00:00Z' },
    });
    await db.transaction((tx) => enqueue(tx, 'leads', [lead('lead-a', 'in_progress'), lead('lead-b', 'cancelled'), lead('lead-a', 'completed')]));
    await expect(
      db.transaction(async (tx) => {
        await enqueue(tx, 'leads', [lead('lead-c', 'cancelled')]);
        throw new Error('бизнес-операция упала');
      }),
    ).rejects.toThrow();

    const bus = new InMemoryEventBus();
    const relay = new OutboxRelay(db, bus, logger);
    expect(await relay.tick()).toBe(3);
    expect(await relay.tick()).toBe(0);

    const events = bus.events('leads.lead.status_changed.v1');
    expect(events.filter((e) => e.leadId === 'lead-a').map((e) => e.toStatus)).toEqual(['in_progress', 'completed']);
    expect(events.some((e) => e.leadId === 'lead-c')).toBe(false);

    const headers = bus.published[0]!.headers;
    expect(headers).toMatchObject({ ce_specversion: '1.0', ce_source: 'leads', ce_type: 'leads.lead.status_changed.v1', 'content-type': 'application/x-protobuf' });
    expect(bus.published[0]!.topic).toBe('leads.lead.v1');
  });

  it('обслуживание создаёт суточные секции до прихода трафика, события попадают в секцию дня', async () => {
    const fresh = await createTestDb();
    await migrate(fresh, []);
    const now = new Date();
    await maintainOutbox(fresh, now);
    const { rows } = await fresh.query<{ name: string }>("SELECT c.relname AS name FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = 'outbox'::regclass ORDER BY 1");
    const stamp = (offset: number) => `outbox_${new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset)).toISOString().slice(0, 10).replaceAll('-', '')}`;
    expect(rows.map((row) => row.name)).toEqual([stamp(0), stamp(1), stamp(2), stamp(3), 'outbox_default']);

    await fresh.transaction((tx) => enqueue(tx, 'reviews', [{ type: 'reviews.rating.aggregated.v1', key: 'm1', payload: { masterId: 'm1', rating: 4.8, reviewsCount: 10, distribution: [0, 0, 1, 1, 8] } }]));
    const placed = await fresh.query<{ part: string }>('SELECT tableoid::regclass::text AS part FROM outbox');
    expect(placed.rows[0]?.part).toBe(stamp(0));
    await fresh.close();
  });

  it('inbox отсекает повторную доставку', async () => {
    let effects = 0;
    const event = { id: '0193f0c4-7a1e-7000-8000-000000000001' };
    const effect = async () => void effects++;
    expect(await processOnce(db, 'notifications', event, effect)).toBe(true);
    expect(await processOnce(db, 'notifications', event, effect)).toBe(false);
    expect(await processOnce(db, 'analytics', event, effect)).toBe(true);
    expect(effects).toBe(2);
  });
});

describe('кодек событий (protobuf)', () => {
  it('сохраняет вложенные структуры и int64', () => {
    const payload = {
      masterId: 'm1', slug: 'ifix', cityId: 'msk', districtId: 'tverskoy', name: 'iFix', tagline: 'Ремонт за час', lat: 55.75, lng: 37.61,
      rating: 4.9, reviewsCount: 128, responseTimeMin: 7, warrantyDays: 180, verified: true, express: true, plan: 'pro', promotionErid: '',
      brandIds: ['apple'], visitTypes: ['workshop'], parts: ['original'], openHours: ['0:10:00-21:00'], completeness: 92, status: 'published',
      version: 9_007_199_254_740, phoneHash: 'a1b2', ownerUserId: 'u1', acceptingLeads: true, serviceRadiusKm: 10,
      offers: [{ serviceId: 'zamena-displeya', priceFromMinor: 450_000, priceToMinor: 1_200_000, tierPricesMinor: [450_000, 600_000, 800_000, 1_000_000, 1_200_000], durationMin: 60, warrantyDays: 180 }],
    };
    const decoded = decodeEvent('catalog.master.upserted.v1', encodeEvent('catalog.master.upserted.v1', payload));
    expect(decoded).toEqual(payload);
  });
});

describe('rate limiting (GCRA)', () => {
  it('пропускает залп и затем ограничивает с Retry-After', async () => {
    const limiter = new RateLimiter(new MemoryStore());
    const rule = { limit: 5, windowMs: 1_000 };
    const decisions = [];
    for (let i = 0; i < 6; i++) decisions.push(await limiter.consume('ip:1', rule));
    expect(decisions.map((d) => d.allowed)).toEqual([true, true, true, true, true, false]);
    expect(decisions.slice(0, 5).map((d) => d.remaining)).toEqual([4, 3, 2, 1, 0]);
    expect(decisions[5]!.retryAfterMs).toBeGreaterThan(150);
    expect(decisions[5]!.retryAfterMs).toBeLessThanOrEqual(200);
  });
});

describe('read-through кэш', () => {
  it('single-flight, негативное кэширование и fail-open', async () => {
    const store = new MemoryStore();
    const cache = new ReadThroughCache(store, { name: 'cards', ttlMs: 60_000, codec: jsonCodec<{ name: string }>() });
    let loads = 0;
    const load = async () => {
      loads++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { name: 'iFix' };
    };
    const [a, b] = await Promise.all([cache.get('m1', load), cache.get('m1', load)]);
    expect(a).toEqual({ name: 'iFix' });
    expect(b).toEqual(a);
    expect(await cache.get('m1', load)).toEqual(a);
    expect(loads).toBe(1);

    expect(await cache.get('missing', async () => null)).toBeNull();
    expect(await cache.get('missing', async () => ({ name: 'не должен загрузиться' }))).toBeNull();

    store.failing = true;
    expect(await cache.get('m2', async () => ({ name: 'из источника' }))).toEqual({ name: 'из источника' });
  });

  it('getMany грузит только промахи одним вызовом', async () => {
    const cache = new ReadThroughCache(new MemoryStore(), { name: 'cards', ttlMs: 60_000, codec: jsonCodec<string>() });
    await cache.set('a', 'A');
    const requested: string[][] = [];
    const result = await cache.getMany(['a', 'b', 'c'], async (missing) => {
      requested.push(missing);
      return new Map(missing.filter((key) => key !== 'c').map((key) => [key, key.toUpperCase()]));
    });
    expect(requested).toEqual([['b', 'c']]);
    expect([...result]).toEqual([['a', 'A'], ['b', 'B']]);
  });
});

describe('ошибки', () => {
  it('код и причина переживают границу gRPC', () => {
    const restored = fromGrpcError(toGrpcError(new AppError('FAILED_PRECONDITION', 'Мастер принимает обращения только в чате', 'contacts_chat_only')));
    expect(restored).toMatchObject({ code: 'FAILED_PRECONDITION', reason: 'contacts_chat_only' });
  });

  it('битый UUID из адреса — некорректный ввод (400), а не внутренняя ошибка (500)', async () => {
    const db = await createTestDb({ migrations: [] });
    const failure = await db.query('SELECT $1::uuid AS id', ['net-takogo']).catch((error: unknown) => error);
    expect(toAppError(failure)).toMatchObject({ code: 'INVALID_ARGUMENT', reason: 'invalid_value' });
    expect(toAppError(new Error('сбой')).code).toBe('INTERNAL');
    await db.close();
  });
});

describe('gRPC-клиент', () => {
  const server = new Server();
  let address = '';
  const seen: Array<{ user?: string; deadlineInMs: number }> = [];

  beforeAll(async () => {
    const definition = loadSync(join(PROTO_DIR, 'masterly/catalog/v1/catalog.proto'), PROTO_LOADER_OPTIONS);
    const pkg = loadPackageDefinition(definition) as unknown as { masterly: { catalog: { v1: { CatalogService: { service: never } } } } };
    server.addService(pkg.masterly.catalog.v1.CatalogService.service, {
      getMaster(call: ServerUnaryCall<{ id?: string; slug?: string }, unknown>, callback: sendUnaryData<unknown>) {
        const deadline = call.getDeadline();
        seen.push({ user: call.metadata.get('x-user-id')[0]?.toString(), deadlineInMs: (deadline instanceof Date ? deadline.getTime() : Number(deadline)) - Date.now() });
        if (call.request.slug === 'ifix') return callback(null, { master: { id: 'm1', slug: 'ifix', name: 'iFix', version: 3 } });
        const metadata = new Metadata();
        metadata.set('x-reason', 'not_found');
        callback({ code: status.NOT_FOUND, details: 'Мастер не найден', metadata });
      },
    });
    const port = await new Promise<number>((resolve, reject) => server.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (error, value) => (error ? reject(error) : resolve(value))));
    address = `127.0.0.1:${port}`;
  });
  afterAll(() => server.forceShutdown());

  it('передаёт пользователя и остаток дедлайна, переводит ошибки в AppError', async () => {
    const client = createGrpcClient<catalog.CatalogServiceClient>({ target: 'catalog', address, protoPath: 'masterly/catalog/v1/catalog.proto', package: 'masterly.catalog.v1', service: 'CatalogService' });
    const response = await runWithContext({ userId: 'u-42', deadline: Date.now() + 300 }, () => client.getMaster({ slug: 'ifix' }));
    expect(response.master).toMatchObject({ id: 'm1', name: 'iFix', version: 3 });
    expect(seen[0]?.user).toBe('u-42');
    expect(seen[0]!.deadlineInMs).toBeLessThanOrEqual(300);

    await expect(client.getMaster({ slug: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND', reason: 'not_found' });
    await expect(runWithContext({ deadline: Date.now() - 1 }, () => client.getMaster({ slug: 'ifix' }))).rejects.toMatchObject({ code: 'DEADLINE_EXCEEDED' });
    client.close();
  });
});

describe('pub/sub и проверка JWT', () => {
  it('pub/sub: несколько слушателей на одной подписке, отписка последнего закрывает канал', async () => {
    const pubsub = new MemoryPubSub();
    const received: string[] = [];
    const first = await pubsub.subscribe('chat:user:1', (message) => received.push(`a:${message}`));
    const second = await pubsub.subscribe('chat:user:1', (message) => received.push(`b:${message}`));
    await pubsub.publish('chat:user:1', 'x');
    await pubsub.publish('chat:user:2', 'чужой');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received.sort()).toEqual(['a:x', 'b:x']);
    await first();
    await second();
    await pubsub.publish('chat:user:1', 'y');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received).toHaveLength(2);
  });

  it('JWT: подпись EdDSA по JWKS, издатель, ротация ключа по kid', async () => {
    const sign = async (kid: string, key: Parameters<SignJWT['sign']>[0], issuer = 'https://id.test') =>
      new SignJWT({ roles: ['client', 'master'], mid: 'm-1', name: 'Алексей' }).setProtectedHeader({ alg: 'EdDSA', kid }).setSubject('u-1').setIssuer(issuer).setAudience('masterly').setExpirationTime('15m').sign(key);
    const first = await generateKeyPair('EdDSA', { extractable: true });
    const second = await generateKeyPair('EdDSA', { extractable: true });
    let keys = [{ ...(await exportJWK(first.publicKey)), kid: 'k1', alg: 'EdDSA' }];
    let loads = 0;
    const verifier = new JwtVerifier(async () => {
      loads++;
      return JSON.stringify({ keys });
    }, 'https://id.test');

    const claims = await verifier.verify(await sign('k1', first.privateKey));
    expect(claims).toMatchObject({ userId: 'u-1', roles: ['client', 'master'], masterId: 'm-1', name: 'Алексей' });
    expect(claims!.expiresAt).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(await verifier.verify(await sign('k1', first.privateKey, 'https://evil.test'))).toBeNull();
    expect(await verifier.verify('не-токен')).toBeNull();

    // Новый ключ identity: незнакомый kid — внеочередная загрузка JWKS, но не чаще раза в 10 секунд
    keys = [...keys, { ...(await exportJWK(second.publicKey)), kid: 'k2', alg: 'EdDSA' }];
    const rotated = await sign('k2', second.privateKey);
    expect(await verifier.verify(rotated)).toBeNull();
    expect(loads).toBe(1);
    vi.useFakeTimers({ now: Date.now() + 11_000, toFake: ['Date'] });
    try {
      expect(await verifier.verify(rotated)).toMatchObject({ userId: 'u-1' });
    } finally {
      vi.useRealTimers();
    }
    expect(loads).toBe(2);
  });

  it('cookie: битое %-кодирование одной cookie не ломает разбор остальных', () => {
    expect(parseCookies('mly_at=abc; broken=%E0%A4%A; theme=dark')).toEqual({ mly_at: 'abc', theme: 'dark' });
  });
});
