import type * as C from '@masterly/contracts';
import type { z } from 'zod';
import { CITIES, cityById, serviceById } from '@masterly/fixtures';
import { conflict, notFound } from '@masterly/platform';
import { identity as I, type platform } from '@masterly/proto';
import * as dto from '../dto.js';
import type { HandlerContext, Handlers } from '../http.js';
import { categoriesFor, invalidateReference, servicesFor } from './reference.js';
import { mastersById } from './shared.js';

const TRUST_KINDS: Record<string, string> = { review: 'review', profile: 'duplicate', photo: 'media', description: 'master' };
const ROLES: Record<C.Role, I.Role> = { client: I.Role.ROLE_CLIENT, master: I.Role.ROLE_MASTER, admin: I.Role.ROLE_ADMIN };
const DAY = 86_400_000;
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
const share = (part: number, whole: number) => (whole > 0 ? round4(part / whole) : 0);
const change = (now: number, before: number) => (before > 0 ? round3((now - before) / before) : 0);

type Service = Awaited<ReturnType<typeof servicesFor>>[number];

function adminService(service: Service, overview: platform.GetPlatformOverviewResponse): C.AdminService {
  const searches = overview.searchesByService[service.id] ?? 0;
  const leads = overview.leadsByService[service.id] ?? 0;
  return { ...service, searches30d: searches, leads30d: leads, conversion: searches ? round3(leads / searches) : 0 };
}

async function leadCounts(ctx: HandlerContext, userIds: string[]): Promise<Record<string, number>> {
  if (userIds.length === 0) return {};
  return ctx.backends.leads.countClientLeads({ clientIds: userIds }).then((response) => response.counts).catch(() => ({}));
}

export const adminHandlers: Handlers = {
  /**
   * Сводка платформы: неделя к предыдущей неделе по аналитике (ClickHouse), мастера — catalog, очередь — trust.
   * Доли — абсолютная разница в процентных пунктах, счётчики — относительное изменение.
   */
  async adminOverview(ctx) {
    const [week, fortnight, stats, moderation, services] = await Promise.all([
      ctx.backends.analytics.getPlatformOverview({ days: 7 }),
      ctx.backends.analytics.getPlatformOverview({ days: 14 }),
      ctx.backends.catalog.getPlatformStats({}),
      ctx.backends.trust.getModerationStats({}),
      servicesFor(ctx, '', { includeDisabled: true }),
    ]);
    const searches = (rows: platform.DailySearches[]) => rows.reduce((sum, row) => sum + row.total, 0);
    const zero = (rows: platform.DailySearches[]) => rows.reduce((sum, row) => sum + row.zeroResults, 0);
    const now = { searches: searches(week.searches), zero: zero(week.searches), leads: week.leads, contacts: week.contacts };
    const before = { searches: searches(fortnight.searches) - now.searches, zero: zero(fortnight.searches) - now.zero, leads: fortnight.leads - now.leads, contacts: fortnight.contacts - now.contacts };
    const byDate = new Map(fortnight.searches.map((row) => [row.date.slice(0, 10), row]));
    const ranked = Object.entries(fortnight.searchesByService).filter(([id]) => id).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const rankedTotal = ranked.reduce((sum, [, count]) => sum + count, 0);
    return {
      kpis: [
        { key: 'searches', label: 'Поисков в сутки', value: Math.round(now.searches / 7), delta: change(now.searches, before.searches), format: 'int' },
        { key: 'zero', label: 'Запросы без результатов', value: share(now.zero, now.searches), delta: round4(share(now.zero, now.searches) - share(before.zero, before.searches)), format: 'percent' },
        { key: 'leads', label: 'Заявок в сутки', value: Math.round(now.leads / 7), delta: change(now.leads, before.leads), format: 'int' },
        { key: 'conversion', label: 'Поиск → контакт', value: share(now.contacts, now.searches), delta: round4(share(now.contacts, now.searches) - share(before.contacts, before.searches)), format: 'percent' },
        { key: 'verified', label: 'Проверенных мастеров', value: share(stats.verifiedTotal, stats.mastersTotal), delta: 0, format: 'percent' },
        { key: 'masters', label: 'Активных мастеров', value: stats.mastersTotal, delta: 0, format: 'int' },
      ],
      searches: Array.from({ length: 14 }, (_, index) => {
        const date = new Date(Date.now() - (13 - index) * DAY).toISOString().slice(0, 10);
        return { date, total: byDate.get(date)?.total ?? 0, zeroResults: byDate.get(date)?.zeroResults ?? 0 };
      }),
      leadsByCity: CITIES.map((city) => ({ cityId: city.id, name: city.name, leads: fortnight.leadsByCity[city.id] ?? 0, masters: stats.cities.find((item) => item.cityId === city.id)?.masters ?? 0 })),
      moderation: { pending: moderation.pending, highRisk: moderation.highRisk, slaBreached: moderation.slaBreached },
      // «Популярные услуги» по числу поисков за две недели; доля — среди топа
      topCategories: ranked.map(([id, count]) => ({ id, name: services.find((service) => service.id === id)?.name ?? serviceById.get(id)?.name ?? id, searches: count, share: rankedTotal ? round3(count / rankedTotal) : 0 })),
    } satisfies C.AdminOverview;
  },

  async moderationQueue(ctx) {
    const query = ctx.query as { kind?: C.ModerationItem['kind']; status: C.ModerationItem['status'] };
    const { items } = await ctx.backends.trust.listModerationItems({ kind: query.kind ? (TRUST_KINDS[query.kind] ?? '') : '', status: query.status === 'pending' ? 'open' : 'decided', page: { cursor: '', limit: 100 } });
    return items.map(dto.moderationItem);
  },

  /** «Отклонить» скрывает отзыв или профиль: решение применяет владелец данных по событию trust.moderation.v1. */
  async moderate(ctx) {
    const body = ctx.body as C.ModerationDecision;
    if (body.decision === 'escalate') {
      const { items } = await ctx.backends.trust.listModerationItems({ kind: '', status: 'open', page: { cursor: '', limit: 200 } });
      const item = items.find((candidate) => candidate.id === ctx.params.id);
      if (!item) throw notFound('Элемент очереди не найден');
      return { ...dto.moderationItem(item), status: 'escalated' as const };
    }
    const { item } = await ctx.backends.trust.decideModeration({ context: ctx.rpc('admin'), itemId: ctx.params.id!, decision: body.decision === 'approve' ? 'approve' : 'hide', reasonCode: body.reasonCode ?? 'manual' });
    return { ...dto.moderationItem(item!), status: body.decision === 'approve' ? ('approved' as const) : ('rejected' as const) };
  },

  async duplicates(ctx) {
    const { candidates } = await ctx.backends.trust.listDuplicateCandidates({ cityId: '' });
    const masters = await mastersById(ctx.backends, candidates.flatMap((candidate) => [candidate.masterAId, candidate.masterBId]));
    return candidates.map((candidate) => dto.duplicate(candidate, masters));
  },

  async resolveDuplicate(ctx) {
    const { candidate } = await ctx.backends.trust.resolveDuplicate({ context: ctx.rpc('admin'), candidateId: ctx.params.id!, action: String(ctx.body.action) });
    return dto.duplicate(candidate!, await mastersById(ctx.backends, [candidate!.masterAId, candidate!.masterBId]));
  },

  async adminServices(ctx) {
    const [services, overview] = await Promise.all([servicesFor(ctx, '', { includeDisabled: true }), ctx.backends.analytics.getPlatformOverview({ days: 30 })]);
    return services.map((service) => adminService(service, overview));
  },

  /** Выключенная услуга пропадает из каталога и SEO-страниц, а мастера не могут подключить её заново. */
  async updateAdminService(ctx) {
    const body = ctx.body as z.output<typeof C.UpdateAdminService>;
    await ctx.backends.catalog.updateService({ id: ctx.params.id!, name: body.name, description: body.description, enabled: body.enabled });
    invalidateReference(ctx);
    const [services, overview] = await Promise.all([servicesFor(ctx, '', { includeDisabled: true }), ctx.backends.analytics.getPlatformOverview({ days: 30 })]);
    const service = services.find((item) => item.id === ctx.params.id);
    if (!service) throw notFound('Услуга не найдена');
    return adminService(service, overview);
  },

  async adminCategories(ctx) {
    return categoriesFor(ctx);
  },

  async updateCategory(ctx) {
    await ctx.backends.catalog.updateCategory({ id: ctx.params.id!, status: String(ctx.body.status) });
    invalidateReference(ctx);
    const category = (await categoriesFor(ctx)).find((item) => item.id === ctx.params.id);
    if (!category) throw notFound('Категория не найдена');
    return category;
  },

  async searchGaps(ctx) {
    const { gaps } = await ctx.backends.analytics.getSearchGaps({ cityId: '', days: 30, limit: 100 });
    return gaps.map((gap): C.SearchGap => ({ query: gap.query, count: gap.hits, trend: 0, categoryHint: '' }));
  },

  async priceStats(ctx) {
    const { stats } = await ctx.backends.catalog.getPriceStats({ cityId: '' });
    return stats.map((stat): C.PriceStat => ({
      serviceId: stat.serviceId, serviceName: serviceById.get(stat.serviceId)?.name ?? stat.serviceId, cityId: stat.cityId, cityName: cityById.get(stat.cityId)?.name ?? stat.cityId,
      min: dto.rub(stat.p25Minor), median: dto.rub(stat.medianMinor), max: dto.rub(stat.p75Minor), mastersCount: stat.masters,
    }));
  },

  /** Поиск по телефону, id или началу имени — identity ищет по индексам; число заявок — из leads одним пакетом. */
  async adminUsers(ctx) {
    const { users } = await ctx.backends.identity.listUsers({ query: String(ctx.query.q ?? ''), limit: 50 });
    const counts = await leadCounts(ctx, users.map((item) => item.user!.id));
    return users.map((item) => dto.adminUser(item, counts[item.user!.id] ?? 0));
  },

  /**
   * Роли меняются со следующим обновлением access-токена (до 15 минут), блокировка сразу отзывает refresh-сессии.
   * Администратор не может заблокировать себя или снять с себя роль — иначе платформа рискует остаться без модераторов.
   */
  async updateAdminUser(ctx) {
    const body = ctx.body as z.output<typeof C.UpdateAdminUser>;
    const userId = ctx.params.id!;
    if (userId === ctx.user().userId && (body.status === 'blocked' || (body.roles && !body.roles.includes('admin')))) {
      throw conflict('Нельзя заблокировать себя или снять с себя роль администратора', 'self_lockout');
    }
    const { user } = await ctx.backends.identity.updateUser({ userId, roles: (body.roles ?? []).map((role) => ROLES[role]), status: body.status ?? '' });
    const counts = await leadCounts(ctx, [userId]);
    return dto.adminUser(user!, counts[userId] ?? 0);
  },
};
