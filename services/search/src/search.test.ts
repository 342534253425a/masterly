import { getMasters, offersFor, type MasterFixture } from '@masterly/fixtures';
import { createGrpcClient, toRecord, type PromiseClient } from '@masterly/platform';
import { createTestResources, startTestMicroservice } from '@masterly/platform/testing';
import { search, type events } from '@masterly/proto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryIndex } from './index/memory-index.js';
import { buildSearchBody } from './index/opensearch-index.js';
import { SearchModule } from './module.js';

const spec = { package: 'masterly.search.v1', protoPath: 'masterly/search/v1/search.proto' };
const masters = getMasters();

/** Снимок профиля, как его публикует catalog (catalog.master.v1). */
function snapshotOf(fixture: MasterFixture, version = 1, patch: Partial<events.MasterUpserted> = {}): events.MasterUpserted {
  return {
    masterId: fixture.id, slug: fixture.slug, cityId: fixture.cityId, districtId: fixture.districtId, name: fixture.name, tagline: fixture.tagline,
    lat: fixture.location.lat, lng: fixture.location.lng, rating: fixture.rating, reviewsCount: fixture.reviewsCount, responseTimeMin: fixture.responseTimeMin,
    warrantyDays: fixture.warrantyDays, verified: fixture.verification.identity && fixture.verification.business, express: fixture.express, plan: fixture.plan,
    promotionErid: fixture.promotion?.erid ?? '', brandIds: fixture.brandIds, visitTypes: fixture.visitTypes, parts: fixture.partsQualities,
    offers: offersFor(fixture).map((offer) => ({
      serviceId: offer.serviceId, priceFromMinor: offer.priceFrom * 100, priceToMinor: offer.priceTo * 100,
      tierPricesMinor: [1, 2, 3, 4, 5].map((tier) => Math.round(offer.priceFrom * 100 * (0.8 + tier * 0.1))), durationMin: offer.durationMin, warrantyDays: offer.warrantyDays,
    })),
    openHours: fixture.schedule.flatMap((day, weekday) => (day ? [`${weekday}:${day.open}-${day.close}`] : [])),
    completeness: fixture.completeness, status: 'published', version, phoneHash: '', ownerUserId: '', acceptingLeads: true, serviceRadiusKm: 10,
    ...patch,
  };
}

const baseFilters: search.SearchFilters = {
  query: '', cityId: 'msk', serviceId: '', modelId: '', brandId: '', openNow: false, verifiedOnly: false, expressOnly: false, visitType: '', parts: '', acceptingLeadsOnly: false,
};

describe('search', async () => {
  const resources = await createTestResources('search');
  const index = new MemoryIndex();
  let server: { address: string; close(): Promise<void> };
  let client: PromiseClient<search.SearchServiceClient> & { close(): void };

  beforeAll(async () => {
    server = await startTestMicroservice(SearchModule.register(resources, { index }), spec);
    client = createGrpcClient<search.SearchServiceClient>({ target: 'search', address: server.address, ...spec, service: 'SearchService', defaultDeadlineMs: 5_000 });
    await resources.bus.publish(masters.map((fixture) => toRecord('catalog', { type: 'catalog.master.upserted.v1', key: fixture.id, payload: snapshotOf(fixture) })));
    await resources.bus.drain();
  });
  afterAll(async () => {
    client.close();
    await server.close();
    await resources.db.close();
  });

  it('read-модель собрана из снимков catalog.master.v1', () => {
    expect(index.size).toBe(masters.length);
  });

  it('понимает проблему, считает цену для сегмента модели и публикует показы', async () => {
    const context = { userId: '', role: '', requestId: 'req-1', locale: 'ru', ipHash: '', masterId: '', name: '' };
    const response = await client.searchMasters({ filters: { ...baseFilters, query: 'разбил экран айфон 13' }, sort: search.Sort.SORT_RELEVANCE, context, page: { cursor: '', limit: 10 } });
    expect(response.interpretation).toMatchObject({ modelId: 'iphone-13' });
    expect(response.interpretation!.services[0]!.serviceId).toBe('display');
    expect(response.hits.length).toBeGreaterThan(0);
    expect(response.hits.every((hit) => hit.price && hit.price.fromMinor > 0)).toBe(true);
    expect(response.page!.total).toBeGreaterThanOrEqual(response.hits.length);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const performed = resources.bus.events('analytics.search.performed.v1').find((event) => event.searchId === response.searchId)!;
    expect(performed.shownMasterIds).toEqual(response.hits.map((hit) => hit.masterId));
    expect(performed.serviceId).toBe('display');

    // Служебный вызов без контекста (счётчики шлюза, подбор получателей заявки) — не поиск пользователя и не показ
    const internal = await client.searchMasters({ filters: baseFilters, sort: search.Sort.SORT_RELEVANCE, context: undefined, page: { cursor: '', limit: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resources.bus.events('analytics.search.performed.v1').some((event) => event.searchId === internal.searchId)).toBe(false);
  });

  it('фильтры, сортировка по цене и курсор', async () => {
    const page1 = await client.searchMasters({ filters: { ...baseFilters, serviceId: 'battery', verifiedOnly: true }, sort: search.Sort.SORT_PRICE, context: undefined, page: { cursor: '', limit: 5 } });
    const prices = page1.hits.filter((hit) => !hit.promoted).map((hit) => hit.price!.fromMinor);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(page1.page!.nextCursor).not.toBe('');
    const page2 = await client.searchMasters({ filters: { ...baseFilters, serviceId: 'battery', verifiedOnly: true }, sort: search.Sort.SORT_PRICE, context: undefined, page: { cursor: page1.page!.nextCursor, limit: 5 } });
    expect(page2.hits.map((hit) => hit.masterId)).not.toEqual(expect.arrayContaining(page1.hits.filter((hit) => !hit.promoted).map((hit) => hit.masterId)));
  });

  it('реклама — только в своих слотах и без дублей в органике', async () => {
    const response = await client.searchMasters({ filters: { ...baseFilters, serviceId: 'display' }, sort: search.Sort.SORT_RELEVANCE, context: undefined, page: { cursor: '', limit: 20 } });
    const promoted = response.hits.filter((hit) => hit.promoted);
    expect(promoted.length).toBeLessThanOrEqual(2);
    const ids = response.hits.map((hit) => hit.masterId);
    expect(new Set(ids).size).toBe(ids.length);
    if (promoted.length > 0) expect(response.hits[0]!.promoted).toBe(true);
  });

  it('рейтинг из отзывов не перетирается снимком профиля, устаревшие снимки игнорируются', async () => {
    const fixture = masters.find((m) => m.cityId === 'msk')!;
    await resources.bus.publish([toRecord('reviews', { type: 'reviews.rating.aggregated.v1', key: fixture.id, payload: { masterId: fixture.id, rating: 3.1, reviewsCount: 40, distribution: [5, 5, 10, 10, 10] } })]);
    await resources.bus.publish([toRecord('catalog', { type: 'catalog.master.upserted.v1', key: fixture.id, payload: snapshotOf(fixture, 2, { name: 'Новое имя' }) })]);
    await resources.bus.publish([toRecord('catalog', { type: 'catalog.master.upserted.v1', key: fixture.id, payload: snapshotOf(fixture, 1, { name: 'Старое имя' }) })]);
    await resources.bus.drain();
    const [doc] = await index.suggestMasters('новое', 'msk', 5);
    expect(doc).toMatchObject({ master_id: fixture.id, rating: 3.1, reviews_count: 40, rating_source: 'reviews', version: 2 });
  });

  it('подсказки: распознанная проблема, услуги и модели', async () => {
    const { suggestions } = await client.suggest({ query: 'не заряжается iphone 12', cityId: 'msk' });
    expect(suggestions[0]).toMatchObject({ type: 'query' });
    const models = await client.suggest({ query: 'galaxy s2', cityId: 'msk' });
    expect(models.suggestions.some((s) => s.type === 'model')).toBe(true);
  });

  it('карта: кластеры при малом масштабе и точки при крупном', async () => {
    const filters = { ...baseFilters, serviceId: 'display' };
    const far = await client.mapPins({ filters, zoom: 10 });
    const near = await client.mapPins({ filters, zoom: 14 });
    expect(far.pins).toHaveLength(0);
    expect(far.clusters.reduce((sum, cluster) => sum + cluster.count, 0)).toBe(near.pins.length);
  });

  it('город обязателен', async () => {
    await expect(client.searchMasters({ filters: { ...baseFilters, cityId: '' }, sort: search.Sort.SORT_RELEVANCE, context: undefined, page: { cursor: '', limit: 10 } })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', reason: 'city_required' });
  });

  it('тело запроса OpenSearch: фильтры, вложенная цена и function_score', () => {
    const body = buildSearchBody({
      cityId: 'msk', serviceId: 'display', tier: 4, origin: { lat: 55.75, lng: 37.61 }, priceMaxMinor: 500_000, verifiedOnly: true, expressOnly: false, urgent: true, sort: 'price', offset: 0, limit: 20,
    });
    const filter = body.query.function_score.query.bool.filter as Array<Record<string, unknown>>;
    expect(filter).toContainEqual({ term: { city_id: 'msk' } });
    expect(filter.some((clause) => 'nested' in clause)).toBe(true);
    expect(body.query.function_score.functions[0]).toMatchObject({ gauss: { location: { scale: '2km' } } });
    expect(JSON.stringify(body.sort)).toContain('offers.price_from');
  });
});
