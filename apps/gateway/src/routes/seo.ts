import type * as C from '@masterly/contracts';
import type { z } from 'zod';
import { CITIES, cityById, cityBySlug, modelById, plural } from '@masterly/fixtures';
import { formatRub, haversineKm } from '@masterly/kernel';
import { notFound } from '@masterly/platform';
import { search as S, type catalog } from '@masterly/proto';
import * as dto from '../dto.js';
import type { Handlers } from '../http.js';
import { cityDto, emptyFilters, modelOf, priceStats, publicService, serviceOf, servicesFor } from './reference.js';
import { mastersById } from './shared.js';

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const percentile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]! : 0);

/** «Гарантия до года / 3 месяцев / 14 дней» — родительный падеж для FAQ. */
function warrantyUntil(days: number): string {
  if (days >= 365) return 'года';
  if (days >= 180) return 'полугода';
  if (days >= 30) {
    const months = Math.round(days / 30);
    return months === 1 ? 'месяца' : `${months} ${plural(months, 'месяца', 'месяцев', 'месяцев')}`;
  }
  return `${days} ${plural(days, 'дня', 'дней', 'дней')}`;
}

/** Цена услуги (и сегмента модели) из предложений мастера — для сравнения без похода в поиск. */
function priceOf(master: catalog.Master, serviceId: string, modelId: string): dto.CardExtras['price'] {
  const offer = serviceId ? master.offers.find((item) => item.enabled && item.serviceId === serviceId) : undefined;
  if (!offer) return null;
  const tier = modelId ? modelById.get(modelId)?.tier : undefined;
  return tier
    ? { serviceId, modelId, fromMinor: dto.modelPriceMinor(offer, tier) }
    : { serviceId, modelId: null, fromMinor: offer.priceFromMinor, toMinor: Math.max(offer.priceToMinor, offer.priceFromMinor) };
}

export const seoHandlers: Handlers = {
  /** Похожие рядом: та же основная услуга, ранжирование поиска от точки мастера; рекламные слоты сюда не попадают. */
  async similarMasters(ctx) {
    const { master } = await ctx.backends.catalog.getMaster({ id: ctx.params.id! });
    if (!master) throw notFound('Мастер не найден');
    const serviceId = master.offers.find((offer) => offer.enabled)?.serviceId ?? '';
    const result = await ctx.backends.search.searchMasters({
      filters: { ...emptyFilters(master.cityId), serviceId, lat: master.location?.lat, lng: master.location?.lng },
      sort: S.Sort.SORT_RELEVANCE,
      page: { cursor: '', limit: 12 },
      context: undefined,
    });
    const hits = result.hits.filter((hit) => hit.masterId !== master.id && !hit.promoted).slice(0, 6);
    const masters = await mastersById(ctx.backends, hits.map((hit) => hit.masterId));
    return hits.flatMap((hit) => {
      const item = masters.get(hit.masterId);
      const price = hit.price && serviceId ? { serviceId, modelId: null, fromMinor: hit.price.fromMinor, toMinor: hit.price.toMinor } : null;
      return item ? [dto.masterCard(item, { distanceKm: hit.distanceKm ?? null, promoted: false, price })] : [];
    });
  },

  async compare(ctx) {
    const query = ctx.query as z.output<typeof C.CompareQuery>;
    const ids = [...new Set(query.ids.split(','))];
    const serviceId = serviceOf(query.service);
    const modelId = modelOf(query.model);
    const tier = modelId ? modelById.get(modelId)?.tier : undefined;
    const masters = await mastersById(ctx.backends, ids);
    const items = ids.flatMap((id): C.CompareItem[] => {
      const master = masters.get(id);
      if (!master) return [];
      const offer = serviceId ? master.offers.find((item) => item.enabled && item.serviceId === serviceId) : undefined;
      return [{
        ...dto.masterCard(master, { promoted: false, price: priceOf(master, serviceId, modelId) }),
        offer: offer ? dto.offer(offer, tier) : null,
        paymentMethods: dto.paymentMethodsOf(master),
        partsQualities: dto.partsOf(master.parts),
        responseRate: dto.profileOf(master).responseRate ?? 0.9,
      }];
    });
    // Лучшее значение подсвечивается, только когда есть с чем сравнить
    const best = <T>(select: (item: C.CompareItem) => T | null, better: (a: T, b: T) => boolean): string | null => {
      if (items.length < 2) return null;
      let winner: string | null = null;
      let value: T | null = null;
      for (const item of items) {
        const current = select(item);
        if (current !== null && (value === null || better(current, value))) {
          winner = item.id;
          value = current;
        }
      }
      return winner;
    };
    const center = items[0] ? cityById.get(items[0].cityId)?.center : undefined;
    return {
      service: serviceId ? dto.serviceRef(serviceId) : null,
      model: dto.modelRef(modelId),
      items,
      best: {
        price: best((item) => item.price?.range.from ?? item.offer?.priceFrom ?? null, (a, b) => a < b),
        rating: best((item) => item.rating * Math.log10(item.reviewsCount + 10), (a, b) => a > b),
        warranty: best((item) => item.offer?.warrantyDays ?? item.warrantyDays, (a, b) => a > b),
        response: best((item) => item.responseTimeMin, (a, b) => a < b),
        distance: center ? best((item) => haversineKm(center, item.location), (a, b) => a < b) : null,
      },
    } satisfies C.CompareResponse;
  },

  /**
   * SEO-страница «услуга (+ модель) в городе»: цифры — из живых данных. Цены без модели — матрица цен catalog
   * по всем мастерам города; для модели — цены сегмента из выдачи. Рейтинг, отзывы и скорость ответа — по 50 лучшим мастерам.
   */
  async landing(ctx) {
    const city = cityBySlug.get(String(ctx.query.city)) ?? cityById.get(String(ctx.query.city));
    if (!city) throw notFound('Город не найден');
    const serviceId = serviceOf(ctx.query.service);
    const modelId = modelOf(ctx.query.model);
    if ((ctx.query.service && !serviceId) || (ctx.query.model && !modelId)) throw notFound('Страница не найдена');
    const [services, stats, result, cityInfo] = await Promise.all([
      servicesFor(ctx, city.id),
      priceStats(ctx, city.id).catch(() => [] as catalog.PriceStat[]),
      ctx.backends.search.searchMasters({ filters: { ...emptyFilters(city.id), serviceId, modelId }, sort: S.Sort.SORT_RELEVANCE, page: { cursor: '', limit: 50 }, context: undefined }),
      cityDto(ctx, city),
    ]);
    const found = serviceId ? services.find((item) => item.id === serviceId) : undefined;
    if (serviceId && !found) throw notFound('Услуга недоступна');
    const masters = await mastersById(ctx.backends, result.hits.map((hit) => hit.masterId));
    const sample = result.hits.flatMap((hit) => (masters.has(hit.masterId) ? [{ hit, master: masters.get(hit.masterId)! }] : []));

    const stat = serviceId ? stats.find((item) => item.serviceId === serviceId) : undefined;
    const segmentPrices = sample.flatMap(({ hit }) => (hit.price ? [hit.price.fromMinor] : [])).sort((a, b) => a - b);
    const priceFrom = dto.rub(modelId ? percentile(segmentPrices, 0.25) : (stat?.p25Minor ?? 0));
    const priceMedian = dto.rub(modelId ? percentile(segmentPrices, 0.5) : (stat?.medianMinor ?? 0));
    const priced = modelId ? segmentPrices.length : (stat?.masters ?? 0);
    const reviewsCount = sample.reduce((sum, { master }) => sum + master.reviewsCount, 0);
    const avgRating = reviewsCount ? sample.reduce((sum, { master }) => sum + master.rating * master.reviewsCount, 0) / reviewsCount : 0;
    const warranty = Math.max(0, ...sample.flatMap(({ master }) => master.offers.filter((offer) => offer.enabled && offer.serviceId === serviceId).map((offer) => offer.warrantyDays)));

    const modelName = modelId ? modelById.get(modelId)?.fullName : undefined;
    const subject = found ? `${found.name.toLowerCase()}${modelName ? ` ${modelName}` : ''}` : modelName ? `ремонт ${modelName}` : 'ремонт смартфона';
    const faq = [
      {
        q: `Сколько стоит ${subject} ${city.nameIn}?`,
        a: found && priceFrom > 0
          ? `По данным ${priced} ${plural(priced, 'мастера', 'мастеров', 'мастеров')} на Masterly — от ${formatRub(priceFrom)}, медианная цена ${formatRub(priceMedian)}. Точную стоимость мастер назовёт после диагностики.`
          : 'Стоимость зависит от модели и неисправности. Опишите проблему — мастера ответят с ценой за несколько минут.',
      },
      { q: 'Сколько времени займёт ремонт?', a: found ? `Обычно около ${Math.max(5, Math.round(found.durationMin / 5) * 5)} минут. Многие мастера делают ремонт при клиенте.` : 'Типовой ремонт занимает от 30 минут до пары часов.' },
      { q: 'Какая гарантия на ремонт?', a: warranty > 0 ? `Мастера дают гарантию до ${warrantyUntil(warranty)}. Условия гарантии указаны в профиле каждого мастера.` : 'Гарантийные условия указаны в профиле мастера и подтверждаются в заявке.' },
      { q: 'Нужно ли платить через Masterly?', a: 'Нет. Платформа не принимает платежи: вы оплачиваете ремонт напрямую мастеру — наличными, картой или по СБП, после выполнения работ.' },
    ];
    // Перелинковка только на страницы, где есть мастера: пустые посадочные вредят и пользователю, и индексации
    const related = [
      ...services.filter((item) => item.id !== serviceId && item.mastersCount > 0).sort((a, b) => b.mastersCount - a.mastersCount).slice(0, 5).map((item) => ({ title: `${item.name} ${city.nameIn}`, city: city.slug, service: item.slug })),
      ...(found ? CITIES.filter((other) => other.id !== city.id).map((other) => ({ title: `${found.name} ${other.nameIn}`, city: other.slug, service: found.slug })) : []),
    ];
    return {
      city: cityInfo,
      service: found ? publicService(found) : null,
      model: dto.modelRef(modelId),
      stats: {
        mastersCount: result.page?.total ?? sample.length,
        priceFrom,
        priceMedian,
        avgRating: Math.round(avgRating * 100) / 100,
        reviewsCount,
        avgResponseMin: Math.round(mean(sample.map(({ master }) => master.responseTimeMin))),
      },
      topMasters: sample.slice(0, 6).map(({ hit, master }) =>
        dto.masterCard(master, { distanceKm: null, promoted: hit.promoted, price: hit.price && serviceId ? { serviceId, modelId: modelId || null, fromMinor: hit.price.fromMinor, toMinor: hit.price.toMinor } : null }),
      ),
      faq,
      related,
    } satisfies C.Landing;
  },
};
