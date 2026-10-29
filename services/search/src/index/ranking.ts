import { haversineKm } from '@masterly/kernel';
import type { IndexQuery, MasterDoc } from './types.js';

/** Байесовский рейтинг: мастер с одной пятёркой не обгоняет мастера с сотней оценок 4,8. */
export const PRIOR_MEAN = 4.5;
export const PRIOR_WEIGHT = 10;
export const bayesian = (rating: number, count: number) => (PRIOR_MEAN * PRIOR_WEIGHT + rating * count) / (PRIOR_WEIGHT + count);

/**
 * Веса ранжирования. Те же сигналы и веса использует function_score в OpenSearch (opensearch-index.ts):
 * близость (гаусс, масштаб зависит от срочности), качество, скорость ответа, полнота профиля, верификация.
 */
export const WEIGHTS = { geo: 0.35, quality: 0.3, speed: 0.15, completeness: 0.1, verified: 0.1, text: 0.5 } as const;

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function geoScale(query: Pick<IndexQuery, 'urgent'>): number {
  return query.urgent ? 2 : 5;
}

export function score(doc: MasterDoc, query: IndexQuery, distanceKm: number): number {
  const scale = geoScale(query);
  const geo = Math.exp(-(distanceKm ** 2) / (2 * scale ** 2));
  const quality = clamp((doc.bayesian_rating - 3) / 2);
  const speed = 1 / (1 + doc.response_time_min / 30);
  const text = query.text && doc.name.toLowerCase().includes(query.text.toLowerCase()) ? WEIGHTS.text : 0;
  return WEIGHTS.geo * geo + WEIGHTS.quality * quality + WEIGHTS.speed * speed + (WEIGHTS.completeness * doc.completeness) / 100 + (doc.verified ? WEIGHTS.verified : 0) + text;
}

export function distanceKm(doc: MasterDoc, origin: { lat: number; lng: number }): number {
  return haversineKm(origin, { lat: doc.location.lat, lng: doc.location.lon });
}

/** Цена услуги для сегмента устройства; без услуги — минимальная «от» по всем услугам. */
export function priceOf(doc: MasterDoc, serviceId?: string, tier?: number): { fromMinor: number; toMinor?: number } | undefined {
  const offers = serviceId ? doc.offers.filter((offer) => offer.service_id === serviceId) : doc.offers;
  const offer = offers.reduce<MasterDoc['offers'][number] | undefined>((best, item) => (!best || item.price_from < best.price_from ? item : best), undefined);
  if (!offer) return undefined;
  const tierPrice = tier ? offer.tier_prices[tier - 1] : undefined;
  const from = tierPrice && tierPrice > 0 ? tierPrice : offer.price_from;
  const max = Math.max(...offer.tier_prices, offer.price_from);
  return { fromMinor: from, toMinor: !tier && max > from ? max : undefined };
}

export function isOpenAt(doc: MasterDoc, at: { weekday: number; minutes: number }): boolean {
  return doc.open_hours.some((hours) => hours.weekday === at.weekday && at.minutes >= hours.open_min && at.minutes < hours.close_min);
}
