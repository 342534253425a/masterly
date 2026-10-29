import { performance } from 'node:perf_hooks';
import { metrics } from '../metrics.js';
import type { KeyValueStore } from './kv.js';

export interface CacheCodec<T> {
  encode(value: T): Uint8Array;
  decode(bytes: Uint8Array): T;
}

export function jsonCodec<T>(): CacheCodec<T> {
  return {
    encode: (value) => Buffer.from(JSON.stringify(value)),
    decode: (bytes) => JSON.parse(Buffer.from(bytes).toString('utf8')) as T,
  };
}

export interface CacheOptions<T> {
  name: string;
  ttlMs: number;
  /** Сколько помнить «не найдено» (защита источника от запросов несуществующих ключей). */
  negativeTtlMs?: number;
  codec: CacheCodec<T>;
  /** Параметр XFetch: > 1 — обновлять раньше. */
  beta?: number;
}

// Конверт значения: [флаг 1 байт][expiresAt float64][время вычисления uint32][payload]
const HEADER = 13;

function pack(payload: Uint8Array | null, ttlMs: number, deltaMs: number): Buffer {
  const buffer = Buffer.allocUnsafe(HEADER + (payload?.byteLength ?? 0));
  buffer.writeUInt8(payload ? 0 : 1, 0);
  buffer.writeDoubleBE(Date.now() + ttlMs, 1);
  buffer.writeUInt32BE(Math.min(0xffffffff, Math.max(0, Math.round(deltaMs))), 9);
  if (payload) buffer.set(payload, HEADER);
  return buffer;
}

function unpack(raw: Buffer) {
  return { negative: raw.readUInt8(0) === 1, expiresAt: raw.readDoubleBE(1), deltaMs: raw.readUInt32BE(9), payload: raw.subarray(HEADER) };
}

/**
 * Read-through кэш:
 *  • single-flight — один запрос к источнику на ключ внутри процесса;
 *  • XFetch — вероятностное раннее обновление горячих ключей до истечения TTL (нет «лавины» промахов);
 *  • негативное кэширование;
 *  • fail-open — ошибка хранилища считается промахом, а не отказом.
 */
export class ReadThroughCache<T> {
  private readonly inflight = new Map<string, Promise<T | null>>();

  constructor(
    private readonly store: KeyValueStore,
    private readonly options: CacheOptions<T>,
  ) {}

  async get(key: string, load: () => Promise<T | null>): Promise<T | null> {
    let raw: Buffer | null;
    try {
      raw = await this.store.get(key);
    } catch {
      this.count('error');
      return this.load(key, load);
    }
    if (!raw) {
      this.count('miss');
      return this.load(key, load);
    }
    const entry = unpack(raw);
    if (Date.now() - entry.deltaMs * (this.options.beta ?? 1) * Math.log(Math.random()) >= entry.expiresAt) {
      this.count('stale');
      void this.load(key, load).catch(() => undefined);
    } else {
      this.count('hit');
    }
    return entry.negative ? null : this.options.codec.decode(entry.payload);
  }

  /** Пакетное чтение: MGET, затем один вызов источника для всех промахов. */
  async getMany(keys: readonly string[], loadMany: (missing: string[]) => Promise<Map<string, T>>): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    let raws: Array<Buffer | null>;
    try {
      raws = await this.store.mget(keys);
    } catch {
      this.count('error', keys.length);
      raws = keys.map(() => null);
    }
    const missing: string[] = [];
    keys.forEach((key, index) => {
      const raw = raws[index];
      if (!raw) return void missing.push(key);
      const entry = unpack(raw);
      if (!entry.negative) result.set(key, this.options.codec.decode(entry.payload));
    });
    this.count('hit', keys.length - missing.length);
    this.count('miss', missing.length);
    if (missing.length > 0) {
      const started = performance.now();
      const loaded = await loadMany(missing);
      const delta = performance.now() - started;
      await Promise.all(
        missing.map((key) => {
          const value = loaded.get(key);
          if (value !== undefined) result.set(key, value);
          return this.write(key, value ?? null, delta);
        }),
      );
    }
    return result;
  }

  async set(key: string, value: T): Promise<void> {
    await this.write(key, value, 0);
  }

  async invalidate(key: string): Promise<void> {
    await this.store.del([key]).catch(() => undefined);
  }

  private load(key: string, load: () => Promise<T | null>): Promise<T | null> {
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const promise = (async () => {
      try {
        const started = performance.now();
        const value = await load();
        await this.write(key, value, performance.now() - started);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }

  private async write(key: string, value: T | null, deltaMs: number): Promise<void> {
    const ttl = value === null ? (this.options.negativeTtlMs ?? 30_000) : this.options.ttlMs;
    try {
      await this.store.set(key, pack(value === null ? null : this.options.codec.encode(value), ttl, deltaMs), ttl);
    } catch {
      // fail-open: значение просто не закэшировано
    }
  }

  private count(result: 'hit' | 'miss' | 'stale' | 'error', amount = 1): void {
    if (amount > 0) metrics.cacheRequests.inc({ cache: this.options.name, result }, amount);
  }
}
