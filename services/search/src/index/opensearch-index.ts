import { AppError } from '@masterly/platform';
import { bayesian, distanceKm, geoScale, priceOf, WEIGHTS } from './ranking.js';
import type { IndexHit, IndexQuery, IndexResult, MasterDoc, SearchIndex } from './types.js';

/** Снимок новее — заменяет документ; рейтинг, пересчитанный по отзывам, сохраняется. */
const UPSERT_SCRIPT = `
if (ctx._source.version != null && ctx._source.version >= params.doc.version) { ctx.op = 'noop'; return; }
boolean keep = ctx._source.rating_source == 'reviews';
def rating = ctx._source.rating; def count = ctx._source.reviews_count; def bayes = ctx._source.bayesian_rating;
ctx._source.putAll(params.doc);
if (keep) { ctx._source.rating = rating; ctx._source.reviews_count = count; ctx._source.bayesian_rating = bayes; ctx._source.rating_source = 'reviews'; }
`;
const RATING_SCRIPT = `ctx._source.rating = params.rating; ctx._source.reviews_count = params.count; ctx._source.bayesian_rating = params.bayes; ctx._source.rating_source = 'reviews';`;

/** Фильтры (кэшируются OpenSearch и не влияют на score). */
export function filters(query: IndexQuery): unknown[] {
  const result: unknown[] = [{ term: { status: 'published' } }, { term: { city_id: query.cityId } }];
  if (query.serviceId) result.push({ term: { service_ids: query.serviceId } });
  if (query.brandId) result.push({ term: { brand_ids: query.brandId } });
  if (query.ratingMin) result.push({ range: { rating: { gte: query.ratingMin } } });
  if (query.warrantyMinDays) result.push({ range: { warranty_days: { gte: query.warrantyMinDays } } });
  if (query.verifiedOnly) result.push({ term: { verified: true } });
  if (query.expressOnly) result.push({ term: { express: true } });
  if (query.visitType) result.push({ term: { visit_types: query.visitType } });
  if (query.parts) result.push({ term: { parts: query.parts } });
  if (query.acceptingLeadsOnly) result.push({ term: { accepting_leads: true } });
  if (query.radiusKm) result.push({ geo_distance: { distance: `${query.radiusKm}km`, location: { lat: query.origin.lat, lon: query.origin.lng } } });
  if (query.priceMaxMinor && query.serviceId) {
    result.push({ nested: { path: 'offers', query: { bool: { filter: [{ term: { 'offers.service_id': query.serviceId } }, { range: { 'offers.price_from': { lte: query.priceMaxMinor } } }] } } } });
  }
  if (query.openAt) {
    const { weekday, minutes } = query.openAt;
    result.push({ nested: { path: 'open_hours', query: { bool: { filter: [{ term: { 'open_hours.weekday': weekday } }, { range: { 'open_hours.open_min': { lte: minutes } } }, { range: { 'open_hours.close_min': { gt: minutes } } }] } } } });
  }
  return result;
}

/** Тело поиска: фильтры + function_score с теми же сигналами и весами, что в ranking.ts. */
export function buildSearchBody(query: IndexQuery) {
  const sort: Record<IndexQuery['sort'], unknown[]> = {
    relevance: ['_score', { master_id: 'asc' }],
    price: [{ 'offers.price_from': { order: 'asc', mode: 'min', nested: { path: 'offers', filter: query.serviceId ? { term: { 'offers.service_id': query.serviceId } } : { match_all: {} } } } }, { master_id: 'asc' }],
    rating: [{ bayesian_rating: 'desc' }, { master_id: 'asc' }],
    distance: [{ _geo_distance: { location: { lat: query.origin.lat, lon: query.origin.lng }, order: 'asc', unit: 'km' } }, { master_id: 'asc' }],
    response: [{ response_time_min: 'asc' }, { master_id: 'asc' }],
  };
  return {
    from: query.offset,
    size: query.limit,
    timeout: '350ms',
    track_total_hits: 1000,
    query: {
      function_score: {
        query: {
          bool: {
            filter: filters(query),
            should: query.text ? [{ multi_match: { query: query.text, fields: ['name^3', 'tagline'], analyzer: 'ru_search', boost: WEIGHTS.text } }] : [],
          },
        },
        functions: [
          { gauss: { location: { origin: { lat: query.origin.lat, lon: query.origin.lng }, scale: `${geoScale(query)}km`, decay: 0.6 } }, weight: WEIGHTS.geo },
          { script_score: { script: { source: "Math.max(0, Math.min(1, (doc['bayesian_rating'].value - 3) / 2))" } }, weight: WEIGHTS.quality },
          { script_score: { script: { source: "1.0 / (1 + doc['response_time_min'].value / 30.0)" } }, weight: WEIGHTS.speed },
          { field_value_factor: { field: 'completeness', factor: WEIGHTS.completeness / 100, missing: 0 } },
          { filter: { term: { verified: true } }, weight: WEIGHTS.verified },
        ],
        score_mode: 'sum',
        boost_mode: 'sum',
      },
    },
    sort: sort[query.sort],
    aggs: { services: { terms: { field: 'service_ids', size: 30 } }, districts: { terms: { field: 'district_id', size: 50 } } },
  };
}

interface Hit {
  _source: MasterDoc;
  _score: number | null;
}

/** Клиент OpenSearch REST поверх fetch: routing по городу, алиас masters, внешняя версия в скрипте. */
export class OpenSearchIndex implements SearchIndex {
  constructor(
    private readonly url: string,
    private readonly alias = 'masters',
  ) {}

  async upsert(doc: MasterDoc): Promise<void> {
    await this.request('POST', `/${this.alias}/_update/${doc.master_id}?routing=${doc.city_id}&retry_on_conflict=3`, { script: { source: UPSERT_SCRIPT, params: { doc } }, upsert: doc });
  }

  async updateRating(masterId: string, rating: number, reviewsCount: number): Promise<void> {
    const found = await this.request<{ hits: { hits: Hit[] } }>('POST', `/${this.alias}/_search`, { size: 1, query: { ids: { values: [masterId] } }, _source: ['city_id'] });
    const city = found?.hits.hits[0]?._source.city_id;
    // Снимок профиля ещё не проиндексирован (пересборка индекса): событие уйдёт в повтор
    if (!city) throw new AppError('UNAVAILABLE', 'Документ мастера ещё не в индексе', 'not_indexed_yet');
    await this.request('POST', `/${this.alias}/_update/${masterId}?routing=${city}&retry_on_conflict=3`, {
      script: { source: RATING_SCRIPT, params: { rating, count: reviewsCount, bayes: bayesian(rating, reviewsCount) } },
    });
  }

  async remove(masterId: string): Promise<void> {
    await this.request('POST', `/${this.alias}/_delete_by_query`, { query: { ids: { values: [masterId] } } });
  }

  async search(query: IndexQuery): Promise<IndexResult> {
    const promotedQuery = { ...query, offset: 0, limit: 6, sort: 'relevance' as const };
    const [main, promoted] = await Promise.all([
      this.request<{ hits: { total: { value: number }; hits: Hit[] }; aggregations: Record<string, { buckets: Array<{ key: string; doc_count: number }> }> }>('POST', `/${this.alias}/_search?routing=${query.cityId}`, buildSearchBody(query)),
      this.request<{ hits: { hits: Hit[] } }>('POST', `/${this.alias}/_search?routing=${query.cityId}`, { ...buildSearchBody(promotedQuery), aggs: undefined, post_filter: { term: { promoted: true } } }),
    ]);
    const toHits = (hits: Hit[]): IndexHit[] =>
      hits.map((hit) => ({ doc: hit._source, score: hit._score ?? 0, distanceKm: distanceKm(hit._source, query.origin), price: priceOf(hit._source, query.serviceId, query.tier) }));
    const buckets = (name: string) => (main?.aggregations[name]?.buckets ?? []).map((bucket) => ({ key: bucket.key, count: bucket.doc_count }));
    return { total: main?.hits.total.value ?? 0, hits: toHits(main?.hits.hits ?? []), promoted: toHits(promoted?.hits.hits ?? []), services: buckets('services'), districts: buckets('districts') };
  }

  async geo(query: IndexQuery, limit: number): Promise<IndexHit[]> {
    const result = await this.search({ ...query, offset: 0, limit, sort: 'relevance' });
    return result.hits;
  }

  async suggestMasters(prefix: string, cityId: string, limit: number): Promise<MasterDoc[]> {
    const body = { size: limit, query: { bool: { filter: [{ term: { status: 'published' } }, { term: { city_id: cityId } }], must: [{ match_phrase_prefix: { name: { query: prefix, max_expansions: 20 } } }] } } };
    const result = await this.request<{ hits: { hits: Hit[] } }>('POST', `/${this.alias}/_search?routing=${cityId}`, body);
    return (result?.hits.hits ?? []).map((hit) => hit._source);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T | undefined> {
    const response = await fetch(`${this.url}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(method === 'POST' && path.includes('_search') ? 400 : 5_000),
    }).catch((error: unknown) => {
      throw new AppError('UNAVAILABLE', `OpenSearch недоступен: ${(error as Error).message}`, 'search_unavailable');
    });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new AppError(response.status === 429 || response.status >= 500 ? 'UNAVAILABLE' : 'INTERNAL', `OpenSearch ответил ${response.status}`, 'search_backend');
    return (await response.json()) as T;
  }
}
