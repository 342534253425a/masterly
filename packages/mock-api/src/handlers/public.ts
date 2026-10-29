import type { CompareItem, Landing, MasterCard } from '@masterly/contracts';
import { BRANDS, CATEGORIES, CITIES, cityById, MODELS, reviewsFor, SERVICES, warrantyLabel, type ServiceFixture } from '@masterly/fixtures';
import { formatRub, formatRuPhone, haversineKm, normalizeText, uuidv7 } from '@masterly/kernel';
import { getDb } from '../db.js';
import { notFound, on, requireSession } from '../http.js';
import { effectiveServiceIds, offersOf, toMasterCard, toMasterProfile, toOffer, toReview } from '../mappers.js';
import { mapPins, priceStats, resolveCity, resolveModel, resolveService, searchMasters, suggest } from '../search.js';

export function serviceDto(service: ServiceFixture, cityId: string) {
  const stats = priceStats(service.id, null, cityId);
  const override = getDb().serviceOverrides.get(service.id);
  return {
    id: service.id,
    slug: service.slug,
    categoryId: service.categoryId,
    name: override?.name ?? service.name,
    short: service.short,
    description: override?.description ?? service.description,
    icon: service.icon,
    problem: service.problem,
    priceFrom: stats.min,
    priceMedian: stats.median,
    durationMin: service.durationMin,
    warrantyDays: service.warrantyDays,
    partsChoice: service.partsChoice,
    brandIds: service.brandIds ? [...service.brandIds] : null,
    mastersCount: stats.count,
  };
}

const findMaster = (idOrSlug: string) => {
  const db = getDb();
  const master = db.masterById.get(idOrSlug) ?? db.masterBySlug.get(idOrSlug);
  if (!master) throw notFound('Мастер');
  return master;
};

export const publicHandlers = [
  on('cities', () =>
    CITIES.map((city) => ({
      id: city.id,
      slug: city.slug,
      name: city.name,
      nameIn: city.nameIn,
      timezone: city.timezone,
      center: city.center,
      zoom: city.zoom,
      hasMetro: city.hasMetro,
      mastersCount: getDb().masters.filter((m) => m.cityId === city.id && !m.duplicateOf).length,
      districts: city.districts.map((d) => ({ id: d.id, name: d.name, center: { lat: d.lat, lng: d.lng } })),
    })),
  ),

  on('categories', () => CATEGORIES.map((c) => ({ ...c, status: getDb().categoryStatus.get(c.id) ?? c.status }))),

  on('services', ({ query }) => {
    const city = resolveCity(query.city);
    return SERVICES.filter((s) => getDb().serviceOverrides.get(s.id)?.enabled !== false).map((s) => serviceDto(s, city.id));
  }),

  on('brands', () => BRANDS.map((b) => ({ id: b.id, slug: b.slug, name: b.name, popular: b.popular, modelsCount: MODELS.filter((m) => m.brandId === b.id).length }))),

  on('models', ({ query }) => {
    const text = query.q ? normalizeText(query.q) : '';
    return MODELS.filter((m) => (!query.brand || m.brandId === query.brand) && (!text || normalizeText(m.fullName).includes(text)))
      .slice(0, 60)
      .map((m) => ({ id: m.id, slug: m.slug, brandId: m.brandId, name: m.name, fullName: m.fullName, year: m.year, tier: m.tier }));
  }),

  on('search', ({ query }) => searchMasters(query)),
  on('suggest', ({ query }) => suggest(query.q, query.city)),
  on('mapPins', ({ query }) => mapPins(query)),

  on('master', ({ params, query }) => {
    const master = findMaster(params.slug);
    const service = resolveService(query.service);
    return toMasterProfile(master, { serviceId: service?.id ?? null, model: resolveModel(query.model) });
  }),

  on('masterReviews', ({ params, query }) => {
    const db = getDb();
    const master = findMaster(params.id);
    let reviews = [...db.createdReviews.filter((r) => r.masterId === master.id), ...reviewsFor(master, 60).map((r) => toReview(r, db.reviewReplies.get(r.id)))];
    if (query.rating) reviews = reviews.filter((r) => r.rating === query.rating);
    if (query.withPhotos) reviews = reviews.filter((r) => r.photos > 0);
    const sorters = {
      recent: (a: (typeof reviews)[number], b: (typeof reviews)[number]) => b.createdAt.localeCompare(a.createdAt),
      rating_desc: (a: (typeof reviews)[number], b: (typeof reviews)[number]) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt),
      rating_asc: (a: (typeof reviews)[number], b: (typeof reviews)[number]) => a.rating - b.rating || b.createdAt.localeCompare(a.createdAt),
      helpful: (a: (typeof reviews)[number], b: (typeof reviews)[number]) => b.helpful - a.helpful,
    };
    reviews.sort(sorters[query.sort]);
    const offset = Number(query.cursor ?? 0) || 0;
    return {
      items: reviews.slice(offset, offset + query.limit),
      nextCursor: offset + query.limit < reviews.length ? String(offset + query.limit) : null,
      total: query.rating || query.withPhotos ? reviews.length : master.reviewsCount,
      distribution: [...master.ratingDistribution],
      rating: master.rating,
    };
  }),

  on('similarMasters', ({ params }) => {
    const master = findMaster(params.id);
    return getDb()
      .masters.filter((m) => m.cityId === master.cityId && m.id !== master.id && !m.duplicateOf && m.serviceIds.some((s) => master.serviceIds.includes(s)))
      .map((m) => ({ m, d: haversineKm(master.location, m.location) - m.rating * 0.6 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6)
      .map(({ m }) => toMasterCard(m, { origin: master.location }));
  }),

  on('revealContacts', ({ params, session }) => {
    const { user } = requireSession(session);
    const master = findMaster(params.id);
    getDb().reveals.push({ masterId: master.id, userId: user.id, at: new Date().toISOString() });
    return {
      revealId: uuidv7(),
      phone: formatRuPhone(master.phone),
      telegram: master.telegram,
      whatsapp: master.whatsapp ? formatRuPhone(master.phone) : null,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
  }),

  on('compare', ({ query }) => {
    const service = resolveService(query.service);
    const model = resolveModel(query.model);
    const items: CompareItem[] = query.ids
      .split(',')
      .map((id) => getDb().masterById.get(id))
      .filter((m) => m !== undefined)
      .map((master) => {
        const offer = service ? offersOf(master).find((o) => o.serviceId === service.id) : undefined;
        return {
          ...toMasterCard(master, { serviceId: service?.id ?? null, model }),
          offer: offer ? toOffer(master, offer, model) : null,
          paymentMethods: master.paymentMethods,
          partsQualities: master.partsQualities,
          responseRate: master.responseRate,
        };
      });
    const best = <T>(select: (item: CompareItem) => T | null, better: (a: T, b: T) => boolean) => {
      let winner: CompareItem | null = null;
      let value: T | null = null;
      for (const item of items) {
        const current = select(item);
        if (current !== null && (value === null || better(current, value))) {
          winner = item;
          value = current;
        }
      }
      return items.length > 1 ? (winner?.id ?? null) : null;
    };
    const city = items[0] ? cityById.get(items[0].cityId) : undefined;
    return {
      service: service ? { id: service.id, name: service.name } : null,
      model: model ? { id: model.id, name: model.fullName } : null,
      items,
      best: {
        price: best((i) => i.price?.range.from ?? i.offer?.priceFrom ?? null, (a, b) => a < b),
        rating: best((i) => i.rating * Math.log10(i.reviewsCount + 10), (a, b) => a > b),
        warranty: best((i) => i.offer?.warrantyDays ?? i.warrantyDays, (a, b) => a > b),
        response: best((i) => i.responseTimeMin, (a, b) => a < b),
        distance: city ? best((i) => haversineKm(city.center, i.location), (a, b) => a < b) : null,
      },
    };
  }),

  on('landing', ({ query }): Landing => {
    const city = resolveCity(query.city);
    const service = resolveService(query.service);
    const model = resolveModel(query.model);
    if (query.service && !service) throw notFound('Услуга');
    const result = searchMasters({ city: city.slug, service: service?.slug, model: model?.id, sort: 'relevance', limit: 6 });
    const masters = getDb().masters.filter((m) => m.cityId === city.id && !m.duplicateOf && (!service || effectiveServiceIds(m).includes(service.id)));
    const stats = service ? priceStats(service.id, model, city.id) : { min: 0, median: 0, max: 0, count: masters.length };
    const reviewsCount = masters.reduce((sum, m) => sum + m.reviewsCount, 0);
    const avgRating = masters.length ? masters.reduce((sum, m) => sum + m.rating * m.reviewsCount, 0) / Math.max(1, reviewsCount) : 0;
    const subject = service ? `${service.name.toLowerCase()}${model ? ` ${model.fullName}` : ''}` : 'ремонт смартфона';
    const faq = [
      {
        q: `Сколько стоит ${subject} ${city.nameIn}?`,
        a: service && stats.count
          ? `По данным ${stats.count} мастеров на Masterly — от ${formatRub(stats.min)}, медианная цена ${formatRub(stats.median)}. Точную стоимость мастер назовёт после бесплатной диагностики.`
          : 'Стоимость зависит от модели и неисправности. Опишите проблему — мастера ответят с ценой за несколько минут.',
      },
      { q: 'Сколько времени займёт ремонт?', a: service ? `Обычно около ${Math.round(service.durationMin / 5) * 5} минут. Многие мастера делают ремонт при клиенте.` : 'Типовой ремонт занимает от 30 минут до пары часов.' },
      { q: 'Какая гарантия на ремонт?', a: service && service.warrantyDays > 0 ? `Мастера дают гарантию до ${warrantyLabel(service.warrantyDays * 2)}. Условия гарантии указаны в профиле каждого мастера.` : 'Гарантийные условия указаны в профиле мастера и подтверждаются в заявке.' },
      { q: 'Нужно ли платить через Masterly?', a: 'Нет. Платформа не принимает платежи: вы оплачиваете ремонт напрямую мастеру — наличными, картой или по СБП, после выполнения работ.' },
    ];
    const related = [
      ...SERVICES.filter((s) => s.id !== service?.id).slice(0, 5).map((s) => ({ title: `${s.name} ${city.nameIn}`, city: city.slug, service: s.slug })),
      ...(service ? CITIES.filter((c) => c.id !== city.id).map((c) => ({ title: `${service.name} ${c.nameIn}`, city: c.slug, service: service.slug })) : []),
    ];
    const items: MasterCard[] = result.items;
    return {
      city: {
        id: city.id,
        slug: city.slug,
        name: city.name,
        nameIn: city.nameIn,
        timezone: city.timezone,
        center: city.center,
        zoom: city.zoom,
        hasMetro: city.hasMetro,
        mastersCount: masters.length,
        districts: city.districts.map((d) => ({ id: d.id, name: d.name, center: { lat: d.lat, lng: d.lng } })),
      },
      service: service ? serviceDto(service, city.id) : null,
      model: model ? { id: model.id, name: model.fullName } : null,
      stats: {
        mastersCount: service ? stats.count : masters.length,
        priceFrom: stats.min,
        priceMedian: stats.median,
        avgRating: Number(avgRating.toFixed(2)),
        reviewsCount,
        avgResponseMin: Math.round(masters.reduce((sum, m) => sum + m.responseTimeMin, 0) / Math.max(1, masters.length)),
      },
      topMasters: items,
      faq,
      related,
    };
  }),
];
