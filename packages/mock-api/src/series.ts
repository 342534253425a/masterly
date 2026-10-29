import { Rng } from '@masterly/fixtures';

const DAY = 86_400_000;

/** Детерминированный временной ряд с трендом и недельной сезонностью — для графиков кабинета и админки. */
export function series(seed: string, days: number, base: number, options: { noise?: number; trend?: number; weekend?: number } = {}): number[] {
  const { noise = 0.22, trend = 0.18, weekend = 0.15 } = options;
  const rng = new Rng(seed);
  return Array.from({ length: days }, (_, i) => {
    const progress = i / Math.max(1, days - 1);
    const weekday = new Date(Date.now() - (days - 1 - i) * DAY).getDay();
    const seasonal = weekday === 0 || weekday === 6 ? 1 + weekend : 1;
    return Math.max(0, Math.round(base * (1 - trend / 2 + trend * progress) * seasonal * rng.float(1 - noise, 1 + noise)));
  });
}

export function dates(days: number): string[] {
  return Array.from({ length: days }, (_, i) => new Date(Date.now() - (days - 1 - i) * DAY).toISOString().slice(0, 10));
}

export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function delta(values: number[]): number {
  const half = Math.floor(values.length / 2);
  const previous = sum(values.slice(0, half));
  const current = sum(values.slice(half));
  return previous === 0 ? 0 : Number(((current - previous) / previous).toFixed(3));
}
