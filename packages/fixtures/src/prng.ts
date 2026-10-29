/** FNV-1a: строка → 32-битный seed. */
export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Детерминированный PRNG (mulberry32): одинаковые данные на каждом запуске, в тестах и в сидах БД. */
export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }

  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
    const total = items.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.next() * total;
    for (const [item, weight] of items) {
      roll -= weight;
      if (roll <= 0) return item;
    }
    return items[items.length - 1]![0];
  }

  sample<T>(items: readonly T[], count: number): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy.slice(0, Math.min(count, copy.length));
  }

  /** Нормальное распределение (Box–Muller), удобно для координат вокруг центра района. */
  gaussian(mean = 0, deviation = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    return mean + deviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

/** Детерминированный UUID-подобный id из строки — стабильные ключи между фронтом и сидами БД. */
export function stableId(namespace: string, key: string | number): string {
  const rng = new Rng(`${namespace}:${key}`);
  const hex = Array.from({ length: 32 }, () => Math.floor(rng.next() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}
