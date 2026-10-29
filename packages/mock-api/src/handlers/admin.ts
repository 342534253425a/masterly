import type { AdminService, PriceStat } from '@masterly/contracts';
import { CATEGORIES, CITIES, SEARCH_GAPS, serviceById, SERVICES } from '@masterly/fixtures';
import { maskPhone } from '@masterly/kernel';
import { getDb } from '../db.js';
import { notFound, on } from '../http.js';
import { computeDuplicates, ensureModeration } from '../moderation.js';
import { priceStats } from '../search.js';
import { dates, delta, series, sum } from '../series.js';
import { serviceDto } from './public.js';

function adminService(serviceId: string): AdminService {
  const service = serviceById.get(serviceId);
  if (!service) throw notFound('Услуга');
  const searches = Math.round(service.demand * 128_000);
  const leads = Math.round(searches * (0.055 + service.demand * 0.02));
  return {
    ...serviceDto(service, 'msk'),
    enabled: getDb().serviceOverrides.get(service.id)?.enabled ?? true,
    searches30d: searches,
    leads30d: leads,
    conversion: Number((leads / searches).toFixed(3)),
  };
}

const adminCategory = (category: (typeof CATEGORIES)[number]) => {
  const db = getDb();
  const status = db.categoryStatus.get(category.id) ?? category.status;
  return {
    ...category,
    status,
    services: SERVICES.filter((s) => s.categoryId === category.id).length,
    masters: category.id === 'smartphones' ? db.masters.filter((m) => !m.duplicateOf).length : 0,
  };
};

export const adminHandlers = [
  on('adminOverview', () => {
    const db = getDb();
    const totals = series('admin:searches', 14, 46_000, { noise: 0.08, trend: 0.12 });
    const zero = totals.map((t, i) => Math.round(t * (0.034 - i * 0.0004)));
    const leads = series('admin:leads', 14, 2_850, { noise: 0.1, trend: 0.16 });
    const moderation = ensureModeration();
    const pending = [...moderation.values()].filter((item) => item.status === 'pending');
    const activeMasters = db.masters.filter((m) => !m.duplicateOf).length;
    return {
      kpis: [
        { key: 'searches', label: 'Поисков за сутки', value: totals.at(-1) ?? 0, delta: delta(totals), format: 'int' as const },
        { key: 'zero', label: 'Запросы без результатов', value: Number(((zero.at(-1) ?? 0) / (totals.at(-1) ?? 1)).toFixed(4)), delta: -0.004, format: 'percent' as const },
        { key: 'leads', label: 'Заявок за сутки', value: leads.at(-1) ?? 0, delta: delta(leads), format: 'int' as const },
        { key: 'conversion', label: 'Поиск → контакт', value: 0.124, delta: 0.012, format: 'percent' as const },
        { key: 'response', label: 'Медиана ответа мастера', value: 14, delta: -0.08, format: 'minutes' as const },
        { key: 'masters', label: 'Активных мастеров', value: activeMasters, delta: 0.03, format: 'int' as const },
      ],
      searches: dates(14).map((date, i) => ({ date, total: totals[i] ?? 0, zeroResults: zero[i] ?? 0 })),
      leadsByCity: CITIES.map((city, i) => ({
        cityId: city.id,
        name: city.name,
        leads: Math.round(sum(leads) * [0.56, 0.31, 0.13][i]!),
        masters: db.masters.filter((m) => m.cityId === city.id && !m.duplicateOf).length,
      })),
      moderation: {
        pending: pending.length,
        highRisk: pending.filter((item) => item.riskScore >= 0.6).length,
        slaBreached: pending.filter((item) => Date.now() - Date.parse(item.createdAt) > 2 * 3_600_000).length,
      },
      topCategories: [...SERVICES]
        .sort((a, b) => b.demand - a.demand)
        .slice(0, 6)
        .map((s, _, top) => ({ id: s.id, name: s.name, searches: Math.round(s.demand * 128_000), share: Number((s.demand / top.reduce((acc, t) => acc + t.demand, 0)).toFixed(3)) })),
    };
  }),

  on('moderationQueue', ({ query }) =>
    [...ensureModeration().values()]
      .filter((item) => item.status === query.status && (!query.kind || item.kind === query.kind))
      .sort((a, b) => b.riskScore - a.riskScore || b.createdAt.localeCompare(a.createdAt)),
  ),

  on('moderate', ({ params, body }) => {
    const item = ensureModeration().get(params.id);
    if (!item) throw notFound('Элемент модерации');
    item.status = body.decision === 'approve' ? 'approved' : body.decision === 'reject' ? 'rejected' : 'escalated';
    return item;
  }),

  on('duplicates', () => computeDuplicates()),

  on('resolveDuplicate', ({ params, body }) => {
    const db = getDb();
    const candidate = computeDuplicates().find((c) => c.id === params.id);
    if (!candidate) throw notFound('Кандидат');
    db.duplicateStatus.set(candidate.id, body.action === 'merge' ? 'merged' : 'dismissed');
    return { ...candidate, status: body.action === 'merge' ? ('merged' as const) : ('dismissed' as const) };
  }),

  on('adminServices', () => SERVICES.map((s) => adminService(s.id))),

  on('updateAdminService', ({ params, body }) => {
    const db = getDb();
    db.serviceOverrides.set(params.id, { ...db.serviceOverrides.get(params.id), ...body });
    return adminService(params.id);
  }),

  on('adminCategories', () => CATEGORIES.map(adminCategory)),

  on('updateCategory', ({ params, body }) => {
    const category = CATEGORIES.find((c) => c.id === params.id);
    if (!category) throw notFound('Категория');
    getDb().categoryStatus.set(category.id, body.status);
    return adminCategory(category);
  }),

  on('searchGaps', () => {
    const live = new Map<string, number>();
    for (const entry of getDb().searchLog.filter((e) => e.total === 0)) live.set(entry.q.toLowerCase(), (live.get(entry.q.toLowerCase()) ?? 0) + 1);
    return [
      ...[...live.entries()].map(([query, count]) => ({ query, count, trend: 0, categoryHint: 'live' })),
      ...SEARCH_GAPS.map((gap) => ({ ...gap })),
    ];
  }),

  on('priceStats', () =>
    SERVICES.filter((s) => s.basePrice > 0).flatMap((service) =>
      CITIES.flatMap((city): PriceStat[] => {
        const stats = priceStats(service.id, null, city.id);
        if (stats.count === 0) return [];
        return [{ serviceId: service.id, serviceName: service.name, cityId: city.id, cityName: city.name, min: stats.min, median: stats.median, max: stats.max, mastersCount: stats.count }];
      }),
    ),
  ),

  on('adminUsers', ({ query }) => {
    const db = getDb();
    const text = query.q?.toLowerCase().trim();
    return [...db.users.values()]
      .filter((u) => !text || u.name.toLowerCase().includes(text) || u.phone.includes(text))
      .map((u) => ({
        id: u.id,
        name: u.name,
        phoneMasked: maskPhone(u.phone),
        roles: u.roles,
        status: u.status,
        createdAt: u.createdAt,
        leadsCount: [...db.leads.values()].filter((l) => l.clientId === u.id).length,
        lastSeenAt: u.lastSeenAt,
      }));
  }),

  on('updateAdminUser', ({ params, body }) => {
    const db = getDb();
    const user = db.users.get(params.id);
    if (!user) throw notFound('Пользователь');
    if (body.roles) {
      user.roles = body.roles;
      if (!body.roles.includes(user.activeRole)) user.activeRole = body.roles[0]!;
    }
    if (body.status) user.status = body.status;
    return {
      id: user.id,
      name: user.name,
      phoneMasked: maskPhone(user.phone),
      roles: user.roles,
      status: user.status,
      createdAt: user.createdAt,
      leadsCount: [...db.leads.values()].filter((l) => l.clientId === user.id).length,
      lastSeenAt: user.lastSeenAt,
    };
  }),
];
