import { bayesian, distanceKm, isOpenAt, priceOf, score } from './ranking.js';
import type { IndexHit, IndexQuery, IndexResult, MasterDoc, SearchIndex } from './types.js';

/**
 * Индекс в памяти с той же семантикой, что OpenSearch: внешняя версия, рейтинг из отзывов не перетирается снимком,
 * те же фильтры и ранжирование. Используется в тестах и локально без OpenSearch.
 */
export class MemoryIndex implements SearchIndex {
  private readonly docs = new Map<string, MasterDoc>();
  private readonly pendingRatings = new Map<string, { rating: number; count: number }>();

  async upsert(doc: MasterDoc): Promise<void> {
    const existing = this.docs.get(doc.master_id);
    if (existing && existing.version >= doc.version) return;
    const next = { ...doc };
    if (existing?.rating_source === 'reviews') Object.assign(next, { rating: existing.rating, reviews_count: existing.reviews_count, bayesian_rating: existing.bayesian_rating, rating_source: 'reviews' });
    const pending = this.pendingRatings.get(doc.master_id);
    if (pending) {
      Object.assign(next, { rating: pending.rating, reviews_count: pending.count, bayesian_rating: bayesian(pending.rating, pending.count), rating_source: 'reviews' });
      this.pendingRatings.delete(doc.master_id);
    }
    this.docs.set(doc.master_id, next);
  }

  async updateRating(masterId: string, rating: number, reviewsCount: number): Promise<void> {
    const doc = this.docs.get(masterId);
    if (!doc) return void this.pendingRatings.set(masterId, { rating, count: reviewsCount });
    this.docs.set(masterId, { ...doc, rating, reviews_count: reviewsCount, bayesian_rating: bayesian(rating, reviewsCount), rating_source: 'reviews' });
  }

  async remove(masterId: string): Promise<void> {
    this.docs.delete(masterId);
  }

  get size(): number {
    return this.docs.size;
  }

  async search(query: IndexQuery): Promise<IndexResult> {
    const matched = this.matching(query);
    const services = facet(this.matching({ ...query, serviceId: undefined }).flatMap((hit) => hit.doc.service_ids));
    const districts = facet(matched.map((hit) => hit.doc.district_id));
    const sorted = sortHits(matched, query);
    return {
      total: sorted.length,
      hits: sorted.slice(query.offset, query.offset + query.limit),
      promoted: sorted.filter((hit) => hit.doc.promoted).slice(0, 6),
      services,
      districts,
    };
  }

  async geo(query: IndexQuery, limit: number): Promise<IndexHit[]> {
    return sortHits(this.matching(query), { ...query, sort: 'relevance' }).slice(0, limit);
  }

  async suggestMasters(prefix: string, cityId: string, limit: number): Promise<MasterDoc[]> {
    const needle = prefix.trim().toLowerCase();
    if (needle.length < 2) return [];
    return [...this.docs.values()]
      .filter((doc) => doc.status === 'published' && doc.city_id === cityId && doc.name.toLowerCase().split(/[\s«»"-]+/).some((word) => word.startsWith(needle)))
      .sort((a, b) => b.bayesian_rating - a.bayesian_rating)
      .slice(0, limit);
  }

  private matching(query: IndexQuery): IndexHit[] {
    const hits: IndexHit[] = [];
    for (const doc of this.docs.values()) {
      if (doc.status !== 'published' || doc.city_id !== query.cityId) continue;
      if (query.serviceId && !doc.service_ids.includes(query.serviceId)) continue;
      if (query.brandId && !doc.brand_ids.includes(query.brandId)) continue;
      if (query.ratingMin && doc.rating < query.ratingMin) continue;
      if (query.warrantyMinDays && doc.warranty_days < query.warrantyMinDays) continue;
      if (query.verifiedOnly && !doc.verified) continue;
      if (query.expressOnly && !doc.express) continue;
      if (query.visitType && !doc.visit_types.includes(query.visitType)) continue;
      if (query.parts && !doc.parts.includes(query.parts)) continue;
      if (query.acceptingLeadsOnly && !doc.accepting_leads) continue;
      if (query.openAt && !isOpenAt(doc, query.openAt)) continue;
      const distance = distanceKm(doc, query.origin);
      if (query.radiusKm && distance > query.radiusKm) continue;
      const price = priceOf(doc, query.serviceId, query.tier);
      if (query.priceMaxMinor && (!price || price.fromMinor > query.priceMaxMinor)) continue;
      hits.push({ doc, distanceKm: distance, price, score: score(doc, query, distance) });
    }
    return hits;
  }
}

function sortHits(hits: IndexHit[], query: IndexQuery): IndexHit[] {
  const by: Record<IndexQuery['sort'], (a: IndexHit, b: IndexHit) => number> = {
    relevance: (a, b) => b.score - a.score,
    price: (a, b) => (a.price?.fromMinor ?? Number.MAX_SAFE_INTEGER) - (b.price?.fromMinor ?? Number.MAX_SAFE_INTEGER),
    rating: (a, b) => b.doc.bayesian_rating - a.doc.bayesian_rating,
    distance: (a, b) => a.distanceKm - b.distanceKm,
    response: (a, b) => a.doc.response_time_min - b.doc.response_time_min,
  };
  return [...hits].sort((a, b) => by[query.sort](a, b) || a.doc.master_id.localeCompare(b.doc.master_id));
}

function facet(values: string[]): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
