import { describe, expect, it } from 'vitest';
import { formatDistance, formatDuration, formatPrice } from './format';

const normalize = (value: string) => value.replace(/\s/g, ' ');

describe('formatters', () => {
  it('рубли без копеек', () => {
    expect(normalize(formatPrice(8900))).toBe('8 900 ₽');
  });
  it('метры и километры', () => {
    expect(normalize(formatDistance(0.43))).toBe('430 м');
    expect(normalize(formatDistance(1.24))).toBe('1,2 км');
  });
  it('минуты и часы', () => {
    expect(normalize(formatDuration(40))).toBe('40 мин');
    expect(normalize(formatDuration(90))).toBe('1,5 ч');
  });
});
