import type * as C from '@masterly/contracts';
import { BRANDS, brandById, CATEGORIES, cityById, cityBySlug, MODELS, modelById, SERVICES, serviceById, serviceBySlug, type CityFixture, type ServiceFixture } from '@masterly/fixtures';
import { search as S, type catalog } from '@masterly/proto';
import * as dto from '../dto.js';
import type { HandlerContext } from '../http.js';
import { mastersById, memo } from './shared.js';

const modelBySlug = new Map(MODELS.map((model) => [model.slug, model]));
const brandBySlug = new Map(BRANDS.map((brand) => [brand.slug, brand]));

/** Фронтенд оперирует slug'ами (SEO-адреса), сервисы — идентификаторами справочников. */
export const cityOf = (value: unknown, ctx: HandlerContext) => {
  const raw = String(value ?? '');
  return cityBySlug.get(raw)?.id ?? (cityById.has(raw) ? raw : (ctx.viewer?.cityId ?? 'msk'));
};
export const serviceOf = (value: unknown) => serviceBySlug.get(String(value ?? ''))?.id ?? (serviceById.has(String(value)) ? String(value) : '');
export const modelOf = (value: unknown) => modelBySlug.get(String(value ?? ''))?.id ?? (modelById.has(String(value)) ? String(value) : '');
export const brandOf = (value: unknown) => brandBySlug.get(String(value ?? ''))?.id ?? (brandById.has(String(value)) ? String(value) : '');

type Loader<T> = (key: string) => Promise<T>;
const caches = new WeakMap<object, Map<string, Loader<unknown>>>();

/** Справочные агрегаты кэшируются в памяти пода — отдельно для каждого набора клиентов (в тестах их несколько). */
function cached<T>(ctx: HandlerContext, name: string, ttlMs: number, load: (key: string) => Promise<T>): Loader<T> {
  let byName = caches.get(ctx.backends);
  if (!byName) {
    byName = new Map();
    caches.set(ctx.backends, byName);
  }
  let loader = byName.get(name) as Loader<T> | undefined;
  if (!loader) {
    loader = memo(ttlMs, load);
    byName.set(name, loader as Loader<unknown>);
  }
  return loader;
}

/** Правки админки (услуги, вертикали) видны на этом поде сразу, на остальных — после TTL кэша. */
export const invalidateReference = (ctx: HandlerContext) => void caches.delete(ctx.backends);

export const emptyFilters = (cityId: string): S.SearchFilters => ({
  query: '', cityId, serviceId: '', modelId: '', brandId: '', openNow: false, verifiedOnly: false, expressOnly: false, visitType: '', parts: '', acceptingLeadsOnly: false,
});

/** Служебные запросы в поиск идут без контекста — search не считает их поисками пользователей и показами. */
export const mastersInCity = (ctx: HandlerContext, cityId: string) =>
  cached(ctx, 'city-masters', 5 * 60_000, async (city) => {
    const result = await ctx.backends.search.searchMasters({ filters: emptyFilters(city), sort: S.Sort.SORT_RELEVANCE, page: { cursor: '', limit: 1 }, context: undefined });
    return result.page?.total ?? 0;
  })(cityId);

export const priceStats = (ctx: HandlerContext, cityId: string) => cached(ctx, 'price-stats', 10 * 60_000, async (city) => (await ctx.backends.catalog.getPriceStats({ cityId: city })).stats)(cityId);

/** Названия, описания и доступность услуг правит админка — публичные страницы берут их из catalog. */
const liveServices = (ctx: HandlerContext) => cached(ctx, 'services', 60_000, async () => (await ctx.backends.catalog.listServices({ categoryId: '' })).services)('all');
const liveCategories = (ctx: HandlerContext) => cached(ctx, 'categories', 60_000, async () => (await ctx.backends.catalog.listCategories({})).categories)('all');

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Ориентиры города для кабинета: средние по 50 лучшим мастерам выдачи (кэш 10 минут). */
export const cityBenchmarks = (ctx: HandlerContext, cityId: string) =>
  cached(ctx, 'city-benchmarks', 10 * 60_000, async (city) => {
    const result = await ctx.backends.search.searchMasters({ filters: emptyFilters(city), sort: S.Sort.SORT_RELEVANCE, page: { cursor: '', limit: 50 }, context: undefined });
    const masters = [...(await mastersById(ctx.backends, result.hits.map((hit) => hit.masterId))).values()];
    const rated = masters.filter((master) => master.reviewsCount > 0);
    return { avgRating: round2(mean(rated.map((master) => master.rating))), avgResponseMin: Math.round(mean(masters.map((master) => master.responseTimeMin))) };
  })(cityId);

/** Индекс цены: средняя по включённым услугам доля «цены от» к медиане города (1 — как рынок). */
export async function priceIndexOf(ctx: HandlerContext, master: catalog.Master): Promise<number> {
  const stats = await priceStats(ctx, master.cityId).catch(() => [] as catalog.PriceStat[]);
  const ratios = master.offers.flatMap((offer) => {
    const median = offer.enabled ? stats.find((stat) => stat.serviceId === offer.serviceId)?.medianMinor : undefined;
    return median ? [offer.priceFromMinor / median] : [];
  });
  return ratios.length ? round2(mean(ratios)) : 1;
}

export async function cityDto(ctx: HandlerContext, city: CityFixture): Promise<C.City> {
  return {
    id: city.id, slug: city.slug, name: city.name, nameIn: city.nameIn, timezone: city.timezone, center: city.center, zoom: city.zoom, hasMetro: city.hasMetro,
    mastersCount: await mastersInCity(ctx, city.id).catch(() => 0),
    districts: city.districts.map((district) => ({ id: district.id, name: district.name, center: { lat: district.lat, lng: district.lng } })),
  };
}

interface Stat {
  p25Minor: number;
  medianMinor: number;
  masters: number;
}

/** По нескольким городам: «от» — наименьший нижний квартиль, медиана — медиана медиан, мастера — сумма. */
function aggregate(stats: catalog.PriceStat[], serviceId: string): Stat | undefined {
  const rows = stats.filter((stat) => stat.serviceId === serviceId);
  if (rows.length === 0) return undefined;
  const medians = rows.map((row) => row.medianMinor).sort((a, b) => a - b);
  return { p25Minor: Math.min(...rows.map((row) => row.p25Minor)), medianMinor: medians[Math.floor(medians.length / 2)]!, masters: rows.reduce((sum, row) => sum + row.masters, 0) };
}

function serviceDto(service: ServiceFixture, live: catalog.Service | undefined, stat: Stat | undefined): C.Service {
  return {
    id: service.id, slug: service.slug, categoryId: service.categoryId, name: live?.name || service.name, short: service.short, description: live?.description || service.description,
    icon: service.icon, problem: service.problem, priceFrom: stat ? dto.rub(stat.p25Minor) : service.basePrice, priceMedian: stat ? dto.rub(stat.medianMinor) : service.basePrice,
    durationMin: live?.durationMin || service.durationMin, warrantyDays: live?.warrantyDays || service.warrantyDays, partsChoice: service.partsChoice,
    brandIds: service.brandIds ? [...service.brandIds] : null, mastersCount: stat?.masters ?? 0,
  };
}

/** Услуги с ценами из реальной матрицы цен (cityId '' — по всем городам). Выключенные админкой — только по запросу. */
export async function servicesFor(ctx: HandlerContext, cityId: string, options: { includeDisabled?: boolean } = {}): Promise<Array<C.Service & { enabled: boolean }>> {
  const [live, stats] = await Promise.all([liveServices(ctx).catch(() => [] as catalog.Service[]), priceStats(ctx, cityId).catch(() => [] as catalog.PriceStat[])]);
  return SERVICES.flatMap((service) => {
    const row = live.find((item) => item.id === service.id);
    const enabled = row?.enabled ?? true;
    return enabled || options.includeDisabled ? [{ ...serviceDto(service, row, aggregate(stats, service.id)), enabled }] : [];
  });
}

export const publicService = ({ enabled: _enabled, ...service }: C.Service & { enabled: boolean }): C.Service => service;

/** Вертикали: статус «запущена / скоро» переключает админка, счётчики считает catalog. */
export async function categoriesFor(ctx: HandlerContext): Promise<Array<C.Category & { services: number; masters: number }>> {
  const live = await liveCategories(ctx).catch(() => [] as catalog.Category[]);
  return CATEGORIES.map((category) => {
    const row = live.find((item) => item.id === category.id);
    return {
      id: category.id, slug: category.slug, name: row?.name || category.name, icon: category.icon, status: row?.status === 'active' || row?.status === 'soon' ? row.status : category.status,
      waitlist: category.waitlist, services: row?.services ?? SERVICES.filter((service) => service.categoryId === category.id).length, masters: row?.masters ?? 0,
    };
  });
}
