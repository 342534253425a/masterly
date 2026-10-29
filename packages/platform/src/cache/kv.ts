import { Cluster, Redis, type RedisOptions } from 'ioredis';

export interface GcraResult {
  allowed: boolean;
  retryAfterMs: number;
  /** Теоретическое время прибытия (TAT) после решения и «сейчас» по часам хранилища. */
  tat: number;
  now: number;
}

/** Минимальный интерфейс key-value: Redis/Valkey в проде, MemoryStore в тестах и как локальный фолбэк. */
export interface KeyValueStore {
  get(key: string): Promise<Buffer | null>;
  mget(keys: readonly string[]): Promise<Array<Buffer | null>>;
  set(key: string, value: string | Uint8Array, ttlMs: number): Promise<void>;
  setIfAbsent(key: string, value: string | Uint8Array, ttlMs: number): Promise<boolean>;
  del(keys: readonly string[]): Promise<void>;
  incr(key: string, ttlMs: number): Promise<number>;
  /** GCRA-шаг атомарно: в Redis — Lua-скрипт с часами сервера (нет рассинхронизации подов). */
  gcra(key: string, emissionMs: number, toleranceMs: number): Promise<GcraResult>;
  close(): Promise<void>;
}

const GCRA_LUA = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local emission = tonumber(ARGV[1])
local tolerance = tonumber(ARGV[2])
local tat = tonumber(redis.call('GET', KEYS[1]) or now)
if tat < now then tat = now end
if now < tat - tolerance then
  return {0, math.ceil(tat - tolerance - now), math.ceil(tat), now}
end
local new_tat = tat + emission
redis.call('SET', KEYS[1], string.format('%.3f', new_tat), 'PX', math.max(1, math.ceil(new_tat - now)))
return {1, 0, math.ceil(new_tat), now}
`;

type GcraClient = { gcra(key: string, emission: number, tolerance: number): Promise<[number, number, number, number]> };

/** Клиент Redis/Valkey: одиночный узел по URL или кластер (Managed Valkey в режиме cluster, TLS по схеме rediss://). */
export function createRedisClient(url: string, options: { cluster?: boolean; redis?: RedisOptions } = {}): Redis | Cluster {
  const redis = options.redis ?? {};
  if (!options.cluster) return new Redis(url, redis);
  const parsed = new URL(url);
  return new Cluster([{ host: parsed.hostname, port: Number(parsed.port || 6379) }], {
    dnsLookup: (address, callback) => callback(null, address),
    enableAutoPipelining: redis.enableAutoPipelining,
    redisOptions: { ...redis, password: decodeURIComponent(parsed.password) || undefined, tls: parsed.protocol === 'rediss:' ? {} : undefined },
  });
}

export class RedisStore implements KeyValueStore {
  private readonly client: Redis | Cluster;

  constructor(url: string, options: { cluster?: boolean; commandTimeoutMs?: number } = {}) {
    this.client = createRedisClient(url, {
      cluster: options.cluster,
      redis: { commandTimeout: options.commandTimeoutMs ?? 50, maxRetriesPerRequest: 1, enableOfflineQueue: false, enableAutoPipelining: true },
    });
    this.client.on('error', () => undefined); // недоступность обрабатывается на вызовах: кэш работает по принципу fail-open
    this.client.defineCommand('gcra', { numberOfKeys: 1, lua: GCRA_LUA });
  }

  get(key: string): Promise<Buffer | null> {
    return this.client.getBuffer(key);
  }

  /** Отдельные GET с автопайплайнингом: работает и в кластере, где ключи разных слотов нельзя собрать в MGET. */
  mget(keys: readonly string[]): Promise<Array<Buffer | null>> {
    return Promise.all(keys.map((key) => this.client.getBuffer(key)));
  }

  async set(key: string, value: string | Uint8Array, ttlMs: number): Promise<void> {
    await this.client.set(key, toBuffer(value), 'PX', Math.max(1, Math.round(ttlMs)));
  }

  async setIfAbsent(key: string, value: string | Uint8Array, ttlMs: number): Promise<boolean> {
    return (await this.client.set(key, toBuffer(value), 'PX', Math.max(1, Math.round(ttlMs)), 'NX')) === 'OK';
  }

  async del(keys: readonly string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.client.del(key)));
  }

  async incr(key: string, ttlMs: number): Promise<number> {
    const value = await this.client.incr(key);
    if (value === 1) await this.client.pexpire(key, Math.max(1, Math.round(ttlMs)));
    return value;
  }

  async gcra(key: string, emissionMs: number, toleranceMs: number): Promise<GcraResult> {
    const [allowed, retryAfterMs, tat, now] = await (this.client as unknown as GcraClient).gcra(key, emissionMs, toleranceMs);
    return { allowed: allowed === 1, retryAfterMs, tat, now };
  }

  async close(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}

/** Хранилище в памяти процесса (тесты; локальный фолбэк лимитера при недоступности Redis). */
export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, { value: Buffer; expiresAt: number }>();
  /** Для тестов: имитация недоступного хранилища. */
  failing = false;

  private entry(key: string) {
    if (this.failing) throw new Error('store unavailable');
    const item = this.data.get(key);
    if (item && item.expiresAt <= Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return item;
  }

  async get(key: string): Promise<Buffer | null> {
    return this.entry(key)?.value ?? null;
  }

  async mget(keys: readonly string[]): Promise<Array<Buffer | null>> {
    return keys.map((key) => this.entry(key)?.value ?? null);
  }

  async set(key: string, value: string | Uint8Array, ttlMs: number): Promise<void> {
    if (this.failing) throw new Error('store unavailable');
    this.data.set(key, { value: toBuffer(value), expiresAt: Date.now() + ttlMs });
  }

  async setIfAbsent(key: string, value: string | Uint8Array, ttlMs: number): Promise<boolean> {
    if (this.entry(key)) return false;
    await this.set(key, value, ttlMs);
    return true;
  }

  async del(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.data.delete(key);
  }

  async incr(key: string, ttlMs: number): Promise<number> {
    const current = this.entry(key);
    const value = Number(current?.value.toString() ?? 0) + 1;
    this.data.set(key, { value: Buffer.from(String(value)), expiresAt: current?.expiresAt ?? Date.now() + ttlMs });
    return value;
  }

  async gcra(key: string, emissionMs: number, toleranceMs: number): Promise<GcraResult> {
    const now = Date.now();
    const tat = Math.max(Number(this.entry(key)?.value.toString() ?? now), now);
    if (now < tat - toleranceMs) return { allowed: false, retryAfterMs: Math.ceil(tat - toleranceMs - now), tat, now };
    const next = tat + emissionMs;
    this.data.set(key, { value: Buffer.from(String(next)), expiresAt: next });
    return { allowed: true, retryAfterMs: 0, tat: next, now };
  }

  async close(): Promise<void> {
    this.data.clear();
  }
}

function toBuffer(value: string | Uint8Array): Buffer {
  return typeof value === 'string' ? Buffer.from(value) : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}
