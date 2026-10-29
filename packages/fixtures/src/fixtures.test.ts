import { describe, expect, it } from 'vitest';
import { getMasters, getProblemClassifier, modelById, offersFor, priceFor, reviewsFor } from './index.js';

describe('fixtures', () => {
  const masters = getMasters();

  it('детерминированы и уникальны', () => {
    expect(masters.length).toBeGreaterThan(200);
    expect(new Set(masters.map((m) => m.slug)).size).toBe(masters.length);
    expect(new Set(masters.map((m) => m.id)).size).toBe(masters.length);
    expect(getMasters()[0]).toBe(masters[0]);
  });

  it('рейтинг согласован с распределением оценок', () => {
    for (const master of masters.slice(0, 50)) {
      const total = master.ratingDistribution.reduce((a, b) => a + b, 0);
      expect(total).toBe(master.reviewsCount);
      expect(master.rating).toBeGreaterThanOrEqual(1);
      expect(master.rating).toBeLessThanOrEqual(5);
    }
  });

  it('флагман дороже бюджетника', () => {
    const master = masters.find((m) => m.specialization === 'all' && m.serviceIds.includes('display'))!;
    const flagship = priceFor(master, 'display', modelById.get('iphone-17-pro-max')!)!;
    const budget = priceFor(master, 'display', modelById.get('galaxy-a15')!)!;
    expect(flagship.from).toBeGreaterThan(budget.from * 2);
    expect(offersFor(master).length).toBe(master.serviceIds.length);
  });

  it('генерирует отзывы лениво', () => {
    const master = masters[0]!;
    const reviews = reviewsFor(master, 10);
    expect(reviews.length).toBe(Math.min(10, master.reviewsCount));
    expect(reviews.map((r) => r.id)).toEqual(reviewsFor(master, 10).map((r) => r.id));
  });

  it('классификатор на реальном словаре каталога', () => {
    const result = getProblemClassifier().classify('у редми ноут 13 про не заряжается');
    expect(result.services[0]?.id).toBe('port');
    expect(result.modelId).toBe('redmi-note-13-pro');
  });
});
