import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Inject, Injectable } from '@nestjs/common';
import { brandById, cityById, getProblemClassifier, modelById, MODELS, SERVICES, serviceById } from '@masterly/fixtures';
import { geohashEncode, localClock, uuidv7 } from '@masterly/kernel';
import { CONFIG, EVENT_BUS, invalid, jsonCodec, KV, LOGGER, ReadThroughCache, toRecord, type EventBus, type KeyValueStore, type Logger } from '@masterly/platform';
import type { events, search } from '@masterly/proto';
import { bayesian } from './index/ranking.js';
import type { IndexHit, IndexQuery, IndexResult, MasterDoc, SearchIndex } from './index/types.js';
import { SEARCH_INDEX } from './tokens.js';

const SORTS: Record<string, IndexQuery['sort']> = { SORT_PRICE: 'price', SORT_RATING: 'rating', SORT_DISTANCE: 'distance', SORT_RESPONSE: 'response' };
/** Позиции рекламных слотов на странице выдачи (маркированные карточки, не больше двух). */
const AD_SLOTS = [0, 5];

/** Снимок профиля из catalog.master.v1 → документ индекса. */
export function toDoc(snapshot: events.MasterUpserted): MasterDoc {
  return {
    master_id: snapshot.masterId,
    slug: snapshot.slug,
    city_id: snapshot.cityId,
    district_id: snapshot.districtId,
    name: snapshot.name,
    tagline: snapshot.tagline,
    location: { lat: snapshot.lat, lon: snapshot.lng },
    rating: snapshot.rating,
    bayesian_rating: bayesian(snapshot.rating, snapshot.reviewsCount),
    reviews_count: snapshot.reviewsCount,
    rating_source: 'catalog',
    response_time_min: snapshot.responseTimeMin,
    warranty_days: snapshot.warrantyDays,
    verified: snapshot.verified,
    express: snapshot.express,
    plan: snapshot.plan,
    promoted: snapshot.promotionErid !== '',
    promotion_erid: snapshot.promotionErid,
    brand_ids: snapshot.brandIds,
    visit_types: snapshot.visitTypes,
    parts: snapshot.parts,
    service_ids: snapshot.offers.map((offer) => offer.serviceId),
    offers: snapshot.offers.map((offer) => ({ service_id: offer.serviceId, price_from: offer.priceFromMinor, tier_prices: offer.tierPricesMinor, warranty_days: offer.warrantyDays, duration_min: offer.durationMin })),
    open_hours: snapshot.openHours.flatMap((value) => {
      const match = /^(\d):(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(value);
      return match ? [{ weekday: Number(match[1]), open_min: Number(match[2]) * 60 + Number(match[3]), close_min: Number(match[4]) * 60 + Number(match[5]) }] : [];
    }),
    completeness: snapshot.completeness,
    status: snapshot.status,
    version: snapshot.version,
    updated_at: new Date().toISOString(),
    accepting_leads: snapshot.acceptingLeads,
    service_radius_km: snapshot.serviceRadiusKm,
  };
}

function interpret(text: string): search.Interpretation {
  if (!text.trim()) return { services: [], brandId: '', modelId: '', urgent: false, confidence: 0, matchedTerms: [] };
  const result = getProblemClassifier().classify(text);
  return {
    services: result.services.map((service) => ({ serviceId: service.id, score: service.score })),
    brandId: result.brandId ?? '',
    modelId: result.modelId ?? '',
    urgent: result.urgent,
    confidence: result.confidence,
    matchedTerms: result.matchedTerms,
  };
}

const encodeCursor = (offset: number) => Buffer.from(String(offset)).toString('base64url');
const decodeCursor = (cursor: string) => (cursor ? Number(Buffer.from(cursor, 'base64url').toString()) || 0 : 0);
const stableHash = (value: unknown) => createHash('sha1').update(JSON.stringify(value)).digest('base64url');

/** Рекламные карточки — в отдельных слотах и без дублей в органике (честная маркировка, ADR-0009). */
export function withAdSlots(result: IndexResult, offset: number): { hits: Array<IndexHit & { promoted: boolean }>; promotedIds: string[] } {
  const organic = result.hits.map((hit) => ({ ...hit, promoted: false }));
  if (offset > 0) return { hits: organic, promotedIds: [] };
  const ads = result.promoted.slice(0, AD_SLOTS.length);
  const adIds = new Set(ads.map((ad) => ad.doc.master_id));
  const hits = organic.filter((hit) => !adIds.has(hit.doc.master_id));
  ads.forEach((ad, index) => hits.splice(Math.min(AD_SLOTS[index]!, hits.length), 0, { ...ad, promoted: true }));
  return { hits, promotedIds: ads.map((ad) => ad.doc.master_id) };
}

@Injectable()
export class SearchService {
  private readonly results: ReadThroughCache<IndexResult>;
  private readonly suggestions: ReadThroughCache<search.Suggestion[]>;
  private readonly salt: string;

  constructor(
    @Inject(SEARCH_INDEX) private readonly index: SearchIndex,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(KV) kv: KeyValueStore,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(CONFIG) config: { ANALYTICS_SALT?: string },
  ) {
    this.results = new ReadThroughCache(kv, { name: 'search', ttlMs: 60_000, negativeTtlMs: 10_000, codec: jsonCodec<IndexResult>() });
    this.suggestions = new ReadThroughCache(kv, { name: 'suggest', ttlMs: 5 * 60_000, codec: jsonCodec<search.Suggestion[]>() });
    this.salt = config.ANALYTICS_SALT ?? 'masterly';
  }

  async search(request: search.SearchMastersRequest): Promise<search.SearchMastersResponse> {
    const started = performance.now();
    const filters = request.filters;
    if (!filters?.cityId || !cityById.has(filters.cityId)) throw invalid('Укажите город', 'city_required');
    const interpretation = interpret(filters.query);
    const limit = Math.min(Math.max(request.page?.limit || 20, 1), 50);
    const offset = Math.min(decodeCursor(request.page?.cursor ?? ''), 500);
    const query = this.toIndexQuery(filters, interpretation, request.sort, offset, limit);
    const result = (await this.results.get(`search:${stableHash(query)}`, () => this.index.search(query)))!;
    const { hits, promotedIds } = withAdSlots(result, offset);
    const searchId = uuidv7();
    const tookMs = Math.round(performance.now() - started);

    // Событие для аналитики: показы карточек, пустые выдачи. Не ждём — поиск не должен зависеть от Kafka.
    // Без контекста запроса — служебный вызов (счётчики шлюза, подбор получателей заявки): это не поиск пользователя и не показ
    if (request.context) {
      const performed: events.SearchPerformed = {
        searchId,
        query: filters.query,
        cityId: query.cityId,
        serviceId: query.serviceId ?? '',
        modelId: filters.modelId || interpretation.modelId,
        resultsCount: result.total,
        tookMs,
        userHash: request.context.userId ? createHash('sha256').update(`${this.salt}:${request.context.userId}`).digest('hex').slice(0, 32) : '',
        at: new Date().toISOString(),
        shownMasterIds: hits.map((hit) => hit.doc.master_id),
        promotedMasterIds: promotedIds,
      };
      void this.bus.publish([toRecord('search', { type: 'analytics.search.performed.v1', key: searchId, payload: performed })]).catch((error: unknown) => this.logger.warn({ err: error }, 'событие поиска не опубликовано'));
    }

    const prices = hits.flatMap((hit) => (hit.price ? [hit.price.fromMinor] : []));
    return {
      searchId,
      hits: hits.map((hit) => ({ masterId: hit.doc.master_id, score: Math.round(hit.score * 1000) / 1000, price: hit.price ? { fromMinor: hit.price.fromMinor, toMinor: hit.price.toMinor } : undefined, distanceKm: Math.round(hit.distanceKm * 10) / 10, promoted: hit.promoted })),
      page: { nextCursor: offset + limit < result.total ? encodeCursor(offset + limit) : '', total: result.total },
      interpretation,
      services: result.services,
      districts: result.districts,
      priceHistogram: histogram(prices),
      tookMs,
    };
  }

  async suggest(request: search.SuggestRequest): Promise<search.SuggestResponse> {
    const text = request.query.trim().toLowerCase();
    const interpretation = interpret(request.query);
    if (text.length < 2) return { suggestions: [], interpretation };
    const suggestions = await this.suggestions.get(`suggest:${request.cityId}:${text}`, async () => {
      const services = SERVICES.filter((service) => [service.name, service.short, ...service.keywords].some((value) => value.toLowerCase().includes(text)))
        .slice(0, 4)
        .map((service) => ({ type: 'service', id: service.id, title: service.name, subtitle: service.short, query: { service: service.slug } }));
      const models = MODELS.filter((model) => model.fullName.toLowerCase().includes(text))
        .slice(0, 3)
        .map((model) => ({ type: 'model', id: model.id, title: model.fullName, subtitle: brandById.get(model.brandId)?.name ?? '', query: { model: model.slug } }));
      const masters = (await this.index.suggestMasters(text, request.cityId, 3)).map((doc) => ({ type: 'master', id: doc.master_id, title: doc.name, subtitle: doc.tagline, query: { master: doc.slug } }));
      const top = interpretation.services[0];
      const service = top && interpretation.confidence >= 0.35 ? serviceById.get(top.serviceId) : undefined;
      const recognized = service
        ? [{ type: 'query', id: service.id, title: [service.name, modelById.get(interpretation.modelId)?.fullName].filter(Boolean).join(' · '), subtitle: 'Поиск по описанию проблемы', query: { q: request.query } }]
        : [];
      return [...recognized, ...services, ...models, ...masters];
    });
    return { suggestions: suggestions ?? [], interpretation };
  }

  async mapPins(request: search.MapPinsRequest): Promise<search.MapPinsResponse> {
    const filters = request.filters;
    if (!filters?.cityId || !cityById.has(filters.cityId)) throw invalid('Укажите город', 'city_required');
    const query = this.toIndexQuery(filters, interpret(filters.query), 'SORT_RELEVANCE', 0, 500);
    const hits = await this.index.geo(query, 500);
    if (request.zoom >= 13) {
      return {
        pins: hits.map((hit) => ({ masterId: hit.doc.master_id, location: { lat: hit.doc.location.lat, lng: hit.doc.location.lon }, rating: hit.doc.rating, priceFromMinor: hit.price?.fromMinor, promoted: hit.doc.promoted, slug: hit.doc.slug, name: hit.doc.name })),
        clusters: [],
      };
    }
    // Кластеры по geohash: точность растёт с масштабом карты
    const precision = request.zoom <= 8 ? 4 : request.zoom <= 10 ? 5 : 6;
    const cells = new Map<string, { lat: number; lng: number; count: number }>();
    for (const hit of hits) {
      const tile = geohashEncode({ lat: hit.doc.location.lat, lng: hit.doc.location.lon }, precision);
      const cell = cells.get(tile) ?? { lat: 0, lng: 0, count: 0 };
      cell.lat += hit.doc.location.lat;
      cell.lng += hit.doc.location.lon;
      cell.count++;
      cells.set(tile, cell);
    }
    return { pins: [], clusters: [...cells].map(([geotile, cell]) => ({ geotile, count: cell.count, center: { lat: cell.lat / cell.count, lng: cell.lng / cell.count } })) };
  }

  private toIndexQuery(filters: search.SearchFilters, interpretation: search.Interpretation, sort: string, offset: number, limit: number): IndexQuery {
    const city = cityById.get(filters.cityId)!;
    const top = interpretation.services[0];
    const serviceId = filters.serviceId || (top && interpretation.confidence >= 0.35 ? top.serviceId : undefined);
    const modelId = filters.modelId || interpretation.modelId;
    const model = modelId ? modelById.get(modelId) : undefined;
    const structured = !!serviceId || !!model;
    return {
      cityId: city.id,
      serviceId,
      brandId: filters.brandId || model?.brandId || interpretation.brandId || undefined,
      tier: model?.tier,
      text: structured ? undefined : filters.query.trim() || undefined,
      origin: filters.lat !== undefined && filters.lng !== undefined ? { lat: filters.lat, lng: filters.lng } : city.center,
      radiusKm: filters.radiusKm || undefined,
      priceMaxMinor: filters.priceMaxMinor || undefined,
      ratingMin: filters.ratingMin || undefined,
      warrantyMinDays: filters.warrantyMinDays || undefined,
      openAt: filters.openNow ? localClock(new Date(), city.timezone) : undefined,
      verifiedOnly: filters.verifiedOnly,
      expressOnly: filters.expressOnly,
      visitType: filters.visitType || undefined,
      parts: filters.parts || undefined,
      acceptingLeadsOnly: filters.acceptingLeadsOnly,
      urgent: interpretation.urgent,
      sort: SORTS[sort] ?? 'relevance',
      offset,
      limit,
    };
  }
}

function histogram(prices: number[]): search.PriceBucket[] {
  if (prices.length === 0) return [];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const step = Math.max(1, Math.ceil((max - min + 1) / 5));
  return Array.from({ length: 5 }, (_, index) => {
    const fromMinor = min + index * step;
    const toMinor = fromMinor + step;
    return { fromMinor, toMinor, count: prices.filter((price) => price >= fromMinor && (price < toMinor || (index === 4 && price <= max))).length };
  }).filter((bucket) => bucket.count > 0);
}

