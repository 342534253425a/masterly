import { circuitBreaker, CircuitState, ConsecutiveBreaker, ExponentialBackoff, handleWhen, SamplingBreaker, wrap } from 'cockatiel';
import { isTransient } from './errors.js';
import { metrics } from './metrics.js';

export interface DependencyPolicy {
  readonly target: string;
  execute<T>(fn: () => Promise<T>): Promise<T>;
  isOpen(): boolean;
}

/**
 * Circuit breaker на зависимость (docs/architecture/resilience.md#5-circuit-breaker):
 * открывается при ≥ 50 % временных ошибок за 10 с (от 20 вызовов) или после 5 ошибок подряд;
 * полуоткрытое состояние через 10 с, при повторных срабатываниях — до 60 с.
 */
export function createDependencyPolicy(target: string): DependencyPolicy {
  const transient = handleWhen((error) => isTransient(error));
  const halfOpenAfter = new ExponentialBackoff({ initialDelay: 10_000, maxDelay: 60_000 });
  const sampling = circuitBreaker(transient, { halfOpenAfter, breaker: new SamplingBreaker({ threshold: 0.5, duration: 10_000, minimumRps: 2 }) });
  const consecutive = circuitBreaker(transient, { halfOpenAfter, breaker: new ConsecutiveBreaker(5) });
  const isOpen = () => sampling.state === CircuitState.Open || consecutive.state === CircuitState.Open;
  const report = () => metrics.breakerOpen.set({ target }, isOpen() ? 1 : 0);
  sampling.onStateChange(report);
  consecutive.onStateChange(report);
  report();

  const policy = wrap(consecutive, sampling);
  return { target, execute: (fn) => policy.execute(() => fn()), isOpen };
}

/**
 * Бюджет повторов: каждый успешный вызов добавляет 0,1 токена (до 10), повтор тратит 1.
 * При массовом сбое повторы не превышают ~10 % трафика и не добивают зависимость.
 */
export class RetryBudget {
  private tokens: number;

  constructor(
    private readonly ratio = 0.1,
    private readonly max = 10,
  ) {
    this.tokens = max;
  }

  onSuccess(): void {
    this.tokens = Math.min(this.max, this.tokens + this.ratio);
  }

  tryAcquire(): boolean {
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
