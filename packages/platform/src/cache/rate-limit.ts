import type { KeyValueStore } from './kv.js';

export interface RateLimitRule {
  /** Сколько запросов в окне при равномерном потоке. */
  limit: number;
  windowMs: number;
  /** Сколько можно сделать подряд «залпом» (по умолчанию = limit). */
  burst?: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
  /** Через сколько «ведро» полностью восстановится — для заголовка RateLimit-Reset. */
  resetMs: number;
}

/**
 * GCRA (Generic Cell Rate Algorithm): один ключ и одно число на клиента, без «окон» и всплесков на их границах.
 * Интервал эмиссии T = window / limit, допуск τ = T × (burst − 1).
 */
export class RateLimiter {
  constructor(private readonly store: KeyValueStore) {}

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    const emission = rule.windowMs / rule.limit;
    const burst = rule.burst ?? rule.limit;
    const tolerance = emission * (burst - 1);
    const result = await this.store.gcra(`rl:${key}`, emission, tolerance);
    const ahead = result.tat - result.now;
    return {
      allowed: result.allowed,
      limit: burst,
      remaining: result.allowed ? Math.max(0, Math.floor((tolerance - ahead) / emission) + 1) : 0,
      retryAfterMs: Math.max(0, Math.ceil(result.retryAfterMs)),
      resetMs: Math.max(0, Math.ceil(ahead)),
    };
  }
}
