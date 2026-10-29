import { describe, expect, it } from 'vitest';
import {
  createProblemClassifier,
  geohashEncode,
  hammingDistance,
  haversineKm,
  isInQuietHours,
  maskPhone,
  normalizeRuPhone,
  openState,
  quietHoursDelayMs,
  simhash64,
  simhashBands,
  slugify,
  trigramSimilarity,
  uuidv7,
  uuidv7Timestamp,
} from './index.js';

const classifier = createProblemClassifier({
  services: [
    { id: 'display', keywords: ['экран', 'диспле', 'разби', 'трещ'], phrases: [['черный экран', 1]] },
    { id: 'battery', keywords: ['батар', 'аккум', 'сади'], phrases: [['быстро садится', 2]] },
    { id: 'port', keywords: ['разъем', 'гнезд'], phrases: [['не заряжается', 2]] },
  ],
  brands: [
    { id: 'apple', aliases: ['apple', 'iphone', 'айфон'] },
    { id: 'samsung', aliases: ['samsung', 'самсунг', 'galaxy'] },
  ],
  models: [
    { id: 'iphone-13', brandId: 'apple', tokens: ['13'] },
    { id: 'iphone-13-pro', brandId: 'apple', tokens: ['13', 'pro'] },
    { id: 'iphone-13-pro-max', brandId: 'apple', tokens: ['13', 'pro', 'max'] },
    { id: 'galaxy-s23-ultra', brandId: 'samsung', tokens: ['s23', 'ultra'] },
  ],
});

describe('problem classifier', () => {
  it('понимает проблему и модель из свободного текста', () => {
    const result = classifier.classify('Разбил экран на айфоне 13 про макс, нужно срочно');
    expect(result.services[0]?.id).toBe('display');
    expect(result.modelId).toBe('iphone-13-pro-max');
    expect(result.brandId).toBe('apple');
    expect(result.urgent).toBe(true);
  });

  it('склеивает «s 23» и узнаёт бренд по модели', () => {
    const result = classifier.classify('самсунг s 23 ультра не заряжается');
    expect(result.services[0]?.id).toBe('port');
    expect(result.modelId).toBe('galaxy-s23-ultra');
  });

  it('не выдумывает модель по одной цифре без бренда', () => {
    expect(classifier.classify('батарея 13').modelId).toBeNull();
  });
});

describe('text similarity', () => {
  it('SimHash близок для перефразированных отзывов', () => {
    const a = simhash64('Отличный мастер, быстро заменил экран, всё работает, рекомендую всем друзьям');
    const b = simhash64('Отличный мастер, быстро заменил экран, всё работает, рекомендую всем знакомым');
    const c = simhash64('Долго ждал запчасть, цена выросла, общение так себе');
    expect(hammingDistance(a, b)).toBeLessThan(hammingDistance(a, c));
    expect(simhashBands(a)).toHaveLength(4);
  });

  it('триграммы как в pg_trgm', () => {
    expect(trigramSimilarity('iFix Lab', 'IFIX LAB')).toBe(1);
    expect(trigramSimilarity('iFix Lab', 'Мастерская Пиксель')).toBeLessThan(0.1);
  });
});

describe('primitives', () => {
  it('нормализует и маскирует телефоны', () => {
    expect(normalizeRuPhone('8 (999) 123-45-67')).toBe('+79991234567');
    expect(normalizeRuPhone('123')).toBeNull();
    expect(maskPhone('+79991234567')).toBe('+7 999 •••-••-67');
  });

  it('гео: расстояние и geohash', () => {
    const moscow = { lat: 55.7558, lng: 37.6173 };
    const spb = { lat: 59.9343, lng: 30.3351 };
    expect(haversineKm(moscow, spb)).toBeGreaterThan(630);
    expect(haversineKm(moscow, spb)).toBeLessThan(640);
    expect(geohashEncode(moscow, 5)).toBe('ucfv0');
  });

  it('слаги и UUIDv7', () => {
    expect(slugify('Замена дисплея')).toBe('zamena-displeya');
    const now = Date.now();
    expect(uuidv7Timestamp(uuidv7(now))).toBe(now);
  });

  it('расписание и тихие часы', () => {
    const schedule = [{ open: '10:00', close: '20:00' }, null, null, null, null, null, null];
    const mondayNoonMsk = new Date('2026-10-26T09:00:00Z');
    expect(openState(schedule, 'Europe/Moscow', mondayNoonMsk)).toEqual({ open: true, closesAt: '20:00' });
    const lateNight = new Date('2026-10-26T20:30:00Z'); // 23:30 МСК
    expect(isInQuietHours({ start: '22:00', end: '08:00' }, 'Europe/Moscow', lateNight)).toBe(true);
    expect(quietHoursDelayMs({ start: '22:00', end: '08:00' }, 'Europe/Moscow', lateNight)).toBe(510 * 60_000);
  });
});
