import type { Facets, GeoPoint, Interpretation, MapPin, MasterCard, SearchQuery, SearchResponse, Suggestion } from '@masterly/contracts';
import {
  brandById,
  CITIES,
  cityById,
  cityBySlug,
  getProblemClassifier,
  modelById,
  MODELS,
  serviceById,
  serviceBySlug,
  SERVICES,
  type CityFixture,
  type MasterFixture,
  type ModelFixture,
} from '@masterly/fixtures';
import { formatRub, haversineKm, normalizeText, trigramSimilarity, uuidv7 } from '@masterly/kernel';
import { getDb } from './db.js';
import { districtNameOf, effectiveServiceIds, isVerified, priceRangeOf, toMasterCard, toOpenState } from './mappers.js';

export const resolveCity = (value?: string | null): CityFixture =>
  (value ? (cityBySlug.get(value) ?? cityById.get(value)) : undefined) ?? CITIES[0]!;
export const resolveService = (value?: string | null) => (value ? (serviceBySlug.get(value) ?? serviceById.get(value) ?? null) : null);
export const resolveModel = (value?: string | null): ModelFixture | null => (value ? (modelById.get(value) ?? null) : null);

export interface PriceStats {
  min: number;
  median: number;
  max: number;
  count: number;
}

const statsCache = new Map<string, PriceStats>();
export const clearPriceStats = () => statsCache.clear();

/** Цена на эталонной модели среднего сегмента — сравнимая метрика для аналитики цен. */
export function referencePrice(master: MasterFixture, serviceId: string): number | null {
  const appleOnly = serviceById.get(serviceId)?.brandIds?.includes('apple') || master.specialization === 'apple';
  return priceRangeOf(master, serviceId, modelById.get(appleOnly ? 'iphone-13-mini' : 'galaxy-a54'))?.from ?? null;
}

export function priceStats(serviceId: string, model: ModelFixture | null, cityId: string): PriceStats {
  const key = `${cityId}:${serviceId}:${model?.id ?? '-'}`;
  const cached = statsCache.get(key);
  if (cached) return cached;
  const prices = getDb()
    .masters.filter((m) => m.cityId === cityId && !m.duplicateOf && effectiveServiceIds(m).includes(serviceId))
    .map((m) => (model ? (priceRangeOf(m, serviceId, model)?.from ?? null) : referencePrice(m, serviceId)))
    .filter((price): price is number => price !== null)
    .sort((a, b) => a - b);
  const stats = { min: prices[0] ?? 0, median: prices[Math.floor(prices.length / 2)] ?? 0, max: prices.at(-1) ?? 0, count: prices.length };
  statsCache.set(key, stats);
  return stats;
}

export function interpret(q: string, city: CityFixture): Interpretation {
  const result = getProblemClassifier().classify(q);
  const services = result.services.flatMap((match) => {
    const service = serviceById.get(match.id);
    return service ? [{ id: service.id, name: service.name, slug: service.slug, score: match.score }] : [];
  });
  const model = result.modelId ? (modelById.get(result.modelId) ?? null) : null;
  const brand = result.brandId ? brandById.get(result.brandId) : undefined;
  const stats = services[0] ? priceStats(services[0].id, model, city.id) : null;
  return {
    query: q,
    services,
    brand: brand ? { id: brand.id, name: brand.name } : null,
    model: model ? { id: model.id, name: model.fullName } : null,
    urgent: result.urgent,
    confidence: result.confidence,
    matchedTerms: result.matchedTerms,
    priceHint: stats && stats.count > 0 ? { from: stats.min, median: stats.median, to: stats.max, mastersCount: stats.count } : null,
  };
}

interface Context {
  city: CityFixture;
  interpretation: Interpretation | null;
  serviceId: string | null;
  model: ModelFixture | null;
  brandId: string | null;
  origin: GeoPoint | null;
  textOnly: string | null;
  now: Date;
}

function buildContext(query: SearchQuery): Context {
  const city = resolveCity(query.city);
  const interpretation = query.q ? interpret(query.q, city) : null;
  const service = resolveService(query.service) ?? (interpretation?.services[0] ? (serviceById.get(interpretation.services[0].id) ?? null) : null);
  const model = resolveModel(query.model) ?? (interpretation?.model ? (modelById.get(interpretation.model.id) ?? null) : null);
  const brandId = query.brand ?? model?.brandId ?? interpretation?.brand?.id ?? null;
  const origin = query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : null;
  const textOnly = query.q && !service && !model && !brandId ? query.q : null;
  return { city, interpretation, serviceId: service?.id ?? null, model, brandId, origin, textOnly, now: new Date() };
}

function matches(master: MasterFixture, ctx: Context, query: SearchQuery, skipService = false): boolean {
  if (master.cityId !== ctx.city.id || master.duplicateOf) return false;
  if (ctx.textOnly) {
    const text = normalizeText(ctx.textOnly);
    if (!normalizeText(master.name).includes(text) && trigramSimilarity(master.name, ctx.textOnly) < 0.3) return false;
  }
  if (!skipService && ctx.serviceId && !effectiveServiceIds(master).includes(ctx.serviceId)) return false;
  if (ctx.brandId && !master.brandIds.includes(ctx.brandId)) return false;
  if (ctx.model && ctx.serviceId && !skipService && !priceRangeOf(master, ctx.serviceId, ctx.model)) return false;
  if (ctx.origin && query.radiusKm && haversineKm(ctx.origin, master.location) > query.radiusKm) return false;
  if (query.ratingMin && master.rating < query.ratingMin) return false;
  if (query.warrantyMin && master.warrantyDays < query.warrantyMin) return false;
  if (query.verified && !isVerified(master)) return false;
  if (query.express && !master.express) return false;
  if (query.visit && !master.visitTypes.includes(query.visit)) return false;
  if (query.parts && !master.partsQualities.includes(query.parts)) return false;
  if (query.openNow && !toOpenState(master, ctx.now).open) return false;
  if (query.priceMax && ctx.serviceId && !skipService) {
    const price = priceRangeOf(master, ctx.serviceId, ctx.model);
    if (!price || price.from > query.priceMax) return false;
  }
  return true;
}

const bayesianRating = (m: MasterFixture) => (m.rating * m.reviewsCount + 4.6 * 25) / (m.reviewsCount + 25);

/**
 * Ранжирование (повторяет function_score поискового сервиса): байесовский рейтинг,
 * объём отзывов, верификация, скорость ответа, «открыто сейчас», расстояние, цена к медиане.
 */
function relevance(master: MasterFixture, ctx: Context, price: number | null, median: number): number {
  let score = bayesianRating(master) * 2.2 + Math.log10(master.reviewsCount + 1) * 0.5;
  if (isVerified(master)) score += 0.45;
  score += (1 - Math.min(master.responseTimeMin, 90) / 90) * 0.6;
  if (toOpenState(master, ctx.now).open) score += ctx.interpretation?.urgent ? 0.6 : 0.25;
  if (master.express && ctx.interpretation?.urgent) score += 0.3;
  if (ctx.origin) score += 1.2 / (1 + haversineKm(ctx.origin, master.location) / 2.5);
  if (price !== null && median > 0) score += Math.max(-0.4, Math.min(0.4, (median - price) / median));
  return score + (master.completeness / 100) * 0.3;
}

function histogram(prices: number[]): Facets['priceHistogram'] {
  if (prices.length === 0) return [];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const buckets = 6;
  const step = Math.max(100, Math.ceil((max - min + 1) / buckets / 100) * 100);
  return Array.from({ length: buckets }, (_, i) => {
    const from = min + i * step;
    const to = from + step;
    return { from, to, count: prices.filter((p) => p >= from && (i === buckets - 1 ? p <= max : p < to)).length };
  }).filter((bucket) => bucket.from <= max);
}

export function searchMasters(query: SearchQuery): SearchResponse {
  const started = performance.now();
  const ctx = buildContext(query);
  const db = getDb();
  const cityMasters = db.masters.filter((m) => m.cityId === ctx.city.id);
  const filtered = cityMasters.filter((m) => matches(m, ctx, query));
  const median = ctx.serviceId ? priceStats(ctx.serviceId, ctx.model, ctx.city.id).median : 0;
  const priceOf = (m: MasterFixture) => (ctx.serviceId ? (priceRangeOf(m, ctx.serviceId, ctx.model)?.from ?? null) : null);

  const scored = filtered.map((master) => ({ master, price: priceOf(master), score: relevance(master, ctx, priceOf(master), median) }));
  const distance = (m: MasterFixture) => haversineKm(ctx.origin ?? ctx.city.center, m.location);
  const sorters: Record<SearchQuery['sort'], (a: (typeof scored)[number], b: (typeof scored)[number]) => number> = {
    relevance: (a, b) => b.score - a.score,
    price: (a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER) || b.score - a.score,
    rating: (a, b) => bayesianRating(b.master) - bayesianRating(a.master),
    distance: (a, b) => distance(a.master) - distance(b.master),
    response: (a, b) => a.master.responseTimeMin - b.master.responseTimeMin || b.score - a.score,
  };
  scored.sort(sorters[query.sort]);

  // Платное продвижение: не более 2 рекламных карточек на позициях 1 и 6, с маркировкой «Реклама»
  let ordered = scored;
  if (query.sort === 'relevance') {
    const promoted = scored.filter((item) => item.master.promotion).slice(0, 2);
    const organic = scored.filter((item) => !promoted.includes(item));
    ordered = [...organic];
    promoted.forEach((item, i) => ordered.splice(Math.min(i === 0 ? 0 : 5, ordered.length), 0, item));
  }

  const offset = Number(query.cursor ?? 0) || 0;
  const pageItems = ordered.slice(offset, offset + query.limit);
  const items: MasterCard[] = pageItems.map(({ master }) => toMasterCard(master, { serviceId: ctx.serviceId, model: ctx.model, origin: ctx.origin, now: ctx.now }));

  const serviceCounts = new Map<string, number>();
  for (const master of cityMasters.filter((m) => matches(m, ctx, query, true))) {
    for (const id of effectiveServiceIds(master)) serviceCounts.set(id, (serviceCounts.get(id) ?? 0) + 1);
  }
  const districtCounts = new Map<string, number>();
  for (const { master } of scored) districtCounts.set(master.districtId, (districtCounts.get(master.districtId) ?? 0) + 1);

  if (query.q) {
    db.searchLog.push({ q: query.q, total: filtered.length, at: Date.now() });
    if (db.searchLog.length > 500) db.searchLog.shift();
  }

  return {
    searchId: uuidv7(),
    items,
    total: filtered.length,
    nextCursor: offset + query.limit < ordered.length ? String(offset + query.limit) : null,
    interpretation: ctx.interpretation,
    facets: {
      services: SERVICES.map((s) => ({ id: s.id, count: serviceCounts.get(s.id) ?? 0 })),
      districts: ctx.city.districts.map((d) => ({ id: d.id, name: d.name, count: districtCounts.get(d.id) ?? 0 })).filter((d) => d.count > 0),
      priceHistogram: histogram(scored.map((s) => s.price).filter((p): p is number => p !== null)),
    },
    tookMs: Math.round((performance.now() - started) * 10) / 10,
  };
}

export function mapPins(query: SearchQuery): { pins: MapPin[]; total: number } {
  const ctx = buildContext(query);
  const pins = getDb()
    .masters.filter((m) => matches(m, ctx, query))
    .map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      location: m.location,
      rating: m.rating,
      price: ctx.serviceId ? (priceRangeOf(m, ctx.serviceId, ctx.model)?.from ?? null) : null,
      promoted: Boolean(m.promotion),
    }));
  return { pins, total: pins.length };
}

export function suggest(q: string, citySlug?: string): { suggestions: Suggestion[]; interpretation: Interpretation | null } {
  const city = resolveCity(citySlug);
  const text = normalizeText(q);
  if (text.length < 2) {
    return {
      interpretation: null,
      suggestions: SERVICES.slice(0, 6).map((s) => ({ type: 'service' as const, id: s.id, title: s.name, subtitle: s.problem, query: { service: s.slug } })),
    };
  }
  const interpretation = interpret(q, city);
  const suggestions: Suggestion[] = [];
  const top = interpretation.services[0];
  if (top) {
    suggestions.push({
      type: 'problem',
      id: `problem:${top.id}:${interpretation.model?.id ?? ''}`,
      title: `${top.name}${interpretation.model ? ` · ${interpretation.model.name}` : ''}`,
      subtitle: interpretation.priceHint ? `от ${formatRub(interpretation.priceHint.from)} · ${interpretation.priceHint.mastersCount} мастеров` : null,
      query: { q, service: top.slug, ...(interpretation.model ? { model: interpretation.model.id } : {}) },
    });
  }
  for (const service of SERVICES.filter((s) => s.id !== top?.id && (normalizeText(s.name).includes(text) || normalizeText(s.short).startsWith(text))).slice(0, 3)) {
    suggestions.push({ type: 'service', id: service.id, title: service.name, subtitle: service.problem, query: { service: service.slug } });
  }
  const models = MODELS.filter((m) => m.id === interpretation.model?.id || normalizeText(m.fullName).includes(text)).slice(0, 3);
  for (const model of models) {
    suggestions.push({ type: 'model', id: model.id, title: model.fullName, subtitle: 'Все услуги для модели', query: { model: model.id } });
  }
  const masters = getDb()
    .masters.filter((m) => m.cityId === city.id && !m.duplicateOf && (normalizeText(m.name).includes(text) || trigramSimilarity(m.name, q) > 0.35))
    .slice(0, 3);
  for (const master of masters) {
    suggestions.push({ type: 'master', id: master.slug, title: master.name, subtitle: `★ ${master.rating.toFixed(1)} · ${districtNameOf(master)}`, query: { master: master.slug } });
  }
  return { interpretation: top || interpretation.model ? interpretation : null, suggestions: suggestions.slice(0, 8) };
}
