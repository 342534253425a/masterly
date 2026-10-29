import type * as C from '@masterly/contracts';
import type { z } from 'zod';
import { forbidden, invalid, notFound } from '@masterly/platform';
import { leads as L, type catalog, type platform } from '@masterly/proto';
import * as dto from '../dto.js';
import type { HandlerContext, Handlers } from '../http.js';
import { cityBenchmarks, priceIndexOf, priceStats, servicesFor } from './reference.js';
import { mastersById, mastersOfLead } from './shared.js';

const DAY = 86_400_000;
const SOURCES = ['search', 'map', 'seo', 'compare', 'direct'] as const;
/** Места в команде — как в catalog (AddStaff): владелец не считается. */
const SEATS = { free: 2, pro: 10 } as const;
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const change = (now: number, before: number) => (before > 0 ? round3((now - before) / before) : 0);

/** Кабинет работает с мастерской из токена (claim mid) — чужую выбрать нельзя. */
function masterIdOf(ctx: HandlerContext): string {
  const masterId = ctx.user().masterId;
  if (!masterId) throw forbidden('Аккаунт не привязан к профилю мастера');
  return masterId;
}

async function ownMaster(ctx: HandlerContext): Promise<catalog.Master> {
  const { master } = await ctx.backends.catalog.getMaster({ id: masterIdOf(ctx) });
  if (!master) throw notFound('Профиль не найден');
  return master;
}

async function profile(ctx: HandlerContext): Promise<C.MasterProfile> {
  const master = await ownMaster(ctx);
  const rating = await ctx.backends.reviews.getRatingSummary({ masterId: master.id }).catch(() => undefined);
  return dto.masterProfile(master, rating);
}

/** Сколько заявок у клиентов за всё время: «постоянный клиент» — заметный сигнал для мастера. */
async function clientCounts(ctx: HandlerContext, items: L.Lead[]): Promise<Record<string, number>> {
  const clientIds = [...new Set(items.map((lead) => lead.clientId).filter(Boolean))];
  if (clientIds.length === 0) return {};
  return ctx.backends.leads.countClientLeads({ clientIds }).then((response) => response.counts).catch(() => ({}));
}

async function cabinetLeads(ctx: HandlerContext, masterId: string, items: L.Lead[]): Promise<C.CabinetLead[]> {
  const [masters, counts] = await Promise.all([mastersById(ctx.backends, items.flatMap(mastersOfLead)), clientCounts(ctx, items)]);
  return items.map((lead) => dto.cabinetLead(lead, masterId, masters, counts));
}

const cabinetLead = async (ctx: HandlerContext, lead: L.Lead) => (await cabinetLeads(ctx, masterIdOf(ctx), [lead]))[0]!;

/** Ряд по дням без пропусков: аналитика не возвращает дни без событий. Даты — UTC, как в хранилище. */
function daily(points: platform.DailyPoint[], days: number, now = Date.now()) {
  const byDate = new Map(points.map((point) => [point.date.slice(0, 10), point]));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now - (days - 1 - index) * DAY).toISOString().slice(0, 10);
    const point = byDate.get(date);
    return { date, impressions: point?.impressions ?? 0, views: point?.views ?? 0, contacts: point?.contacts ?? 0, leads: point?.leads ?? 0, promoted: point?.promoted ?? 0 };
  });
}
type Day = ReturnType<typeof daily>[number];
const total = (rows: Day[], key: Exclude<keyof Day, 'date'>) => rows.reduce((sum, row) => sum + row[key], 0);
const conversion = (rows: Day[]) => (total(rows, 'views') ? round3(total(rows, 'leads') / total(rows, 'views')) : 0);

/** Сдвиг часового пояса города относительно UTC (часы активности показываются по местному времени). */
function utcOffsetHours(timeZone: string, now = new Date()): number {
  const local = Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now));
  return (local - now.getUTCHours() + 24) % 24;
}

/** Подсказки по профилю — те же проверки, из которых catalog считает полноту для ранжирования. */
function completeness(master: catalog.Master): C.CabinetOverview['completeness'] {
  const enabled = master.offers.filter((offer) => offer.enabled).length;
  const checks = [
    { key: 'tagline', ok: master.tagline.length >= 10, label: 'Добавьте короткий слоган — его видно в выдаче', impact: 10 },
    { key: 'about', ok: master.about.length >= 80, label: 'Расскажите о себе подробнее — от 80 символов', impact: 10 },
    { key: 'address', ok: master.address.length > 0, label: 'Укажите адрес мастерской', impact: 10 },
    { key: 'brands', ok: master.brandIds.length > 0, label: 'Отметьте бренды, с которыми работаете', impact: 10 },
    { key: 'offers', ok: enabled >= 3, label: enabled === 0 ? 'Добавьте услуги и цены' : 'Добавьте хотя бы три услуги', impact: enabled === 0 ? 20 : 10 },
    { key: 'schedule', ok: master.schedule.some((day) => !day.dayOff && !!day.open), label: 'Заполните график работы', impact: 10 },
    { key: 'photos', ok: (dto.profileOf(master).photos?.length ?? 0) >= 3, label: 'Добавьте фото выполненных работ', impact: 10 },
    { key: 'identity', ok: master.verification?.identity ?? false, label: 'Подтвердите личность — появится отметка «Проверен»', impact: 10 },
    { key: 'phone', ok: master.phoneMasked.length > 0, label: 'Укажите телефон для связи', impact: 10 },
  ];
  const missing = checks.filter((check) => !check.ok).map(({ key, label, impact }) => ({ key, label, impact }));
  return { score: Math.max(0, 100 - missing.reduce((sum, item) => sum + item.impact, 0)), missing };
}

async function offersOf(ctx: HandlerContext, master: catalog.Master): Promise<C.CabinetOffer[]> {
  const [services, stats] = await Promise.all([servicesFor(ctx, master.cityId), priceStats(ctx, master.cityId).catch(() => [] as catalog.PriceStat[])]);
  const own = new Map(master.offers.map((offer) => [offer.serviceId, offer]));
  return services.map((service): C.CabinetOffer => {
    const offer = own.get(service.id);
    const median = stats.find((stat) => stat.serviceId === service.id)?.medianMinor;
    const marketMedian = median ? dto.rub(median) : service.priceMedian;
    // Услуги, которых у мастера ещё нет, предлагаются выключенными с рыночными ценами — включить можно одним переключателем
    if (!offer) return { serviceId: service.id, enabled: false, priceFrom: marketMedian, priceTo: Math.round((marketMedian * 1.5) / 100) * 100, durationMin: service.durationMin, warrantyDays: service.warrantyDays, parts: service.partsChoice ? ['original', 'oem'] : [], marketMedian };
    const { priceFrom, priceTo, warrantyDays, parts } = dto.offer(offer);
    return { serviceId: service.id, enabled: offer.enabled, priceFrom, priceTo, durationMin: offer.durationMin || service.durationMin, warrantyDays, parts, marketMedian };
  });
}

function scheduleOf(master: catalog.Master): C.CabinetSchedule {
  return {
    schedule: [...dto.weekly(master.schedule)],
    acceptingLeads: master.acceptingLeads,
    vacation: master.vacationFrom && master.vacationTo ? { from: master.vacationFrom, to: master.vacationTo } : null,
    timezone: dto.timezoneOf(master.cityId),
    zone: {
      center: { lat: master.location?.lat ?? 0, lng: master.location?.lng ?? 0 },
      radiusKm: Math.min(50, Math.max(1, master.serviceRadiusKm || 10)),
      visitTypes: master.visitTypes.filter((type): type is C.VisitType => ['workshop', 'onsite', 'courier'].includes(type)),
    },
  };
}

function teamOf(master: catalog.Master): C.CabinetTeam {
  const extras = dto.profileOf(master);
  const staff = extras.staff ?? [];
  return {
    staff: staff.map((member) => ({ id: member.id, name: member.name, role: member.role, experienceYears: member.experienceYears ?? 0, branchId: member.branchId ?? null })),
    branches: (extras.branches ?? []).map((branch) => ({ id: branch.id, name: branch.name, address: branch.address, districtName: dto.districtName(master.cityId, branch.districtId) })),
    seats: { used: staff.filter((member) => member.role !== 'owner').length, limit: SEATS[master.plan === 'pro' ? 'pro' : 'free'] },
  };
}

export const cabinetHandlers: Handlers = {
  /** Сводка за 30 дней с изменением к предыдущим 30: ряды аналитики, входящие заявки, отзывы и ориентиры города. */
  async cabinetOverview(ctx) {
    const master = await ownMaster(ctx);
    const [report, recentReport, rating, incoming, benchmarks, priceIndex] = await Promise.all([
      ctx.backends.analytics.getMasterReport({ masterId: master.id, days: 60 }),
      ctx.backends.analytics.getMasterReport({ masterId: master.id, days: 30 }),
      ctx.backends.reviews.getRatingSummary({ masterId: master.id }).catch(() => undefined),
      ctx.backends.leads.listMasterLeads({ context: ctx.rpc('master'), masterId: master.id, statuses: [], page: { cursor: '', limit: 50 } }),
      cityBenchmarks(ctx, master.cityId).catch(() => undefined),
      priceIndexOf(ctx, master),
    ]);
    const days = daily(report.series, 60);
    const previous = days.slice(0, 30);
    const current = days.slice(30);
    const kpi = (key: 'impressions' | 'views' | 'contacts' | 'leads'): C.Kpi => ({ key, value: total(current, key), delta: change(total(current, key), total(previous, key)), series: current.map((row) => row[key]) });

    // Услуги и выполненные — по последним 50 входящим заявкам за 30 дней
    const since = Date.now() - 30 * DAY;
    const recent = incoming.leads.filter((lead) => Date.parse(lead.createdAt) >= since);
    const byService = new Map<string, number>();
    for (const lead of recent) byService.set(lead.serviceId, (byService.get(lead.serviceId) ?? 0) + 1);
    const completed = incoming.leads.filter((lead) => lead.acceptedMasterId === master.id && dto.leadStatus(lead.status) === 'completed' && Date.parse(lead.updatedAt) >= since).length;

    return {
      master: dto.masterLite(master),
      plan: master.plan === 'pro' ? 'pro' : 'free',
      kpis: [
        kpi('impressions'),
        kpi('views'),
        kpi('contacts'),
        kpi('leads'),
        { key: 'conversion', value: conversion(current), delta: change(conversion(current), conversion(previous)), series: current.map((row) => (row.views ? round3(row.leads / row.views) : 0)) },
        // Истории времени ответа нет — текущее значение из профиля, без динамики
        { key: 'response', value: master.responseTimeMin, delta: 0, series: current.map(() => master.responseTimeMin) },
      ],
      funnel: [
        { stage: 'impressions', value: total(current, 'impressions') },
        { stage: 'views', value: total(current, 'views') },
        { stage: 'contacts', value: total(current, 'contacts') },
        { stage: 'leads', value: total(current, 'leads') },
        { stage: 'completed', value: completed },
      ],
      topServices: [...byService]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([serviceId, count]) => ({ serviceId, name: dto.serviceRef(serviceId).name, leads: count, share: round3(count / recent.length) })),
      topQueries: [...recentReport.queries]
        .sort((a, b) => b.views - a.views || b.leads - a.leads || b.impressions - a.impressions)
        .slice(0, 5)
        .map((query) => ({ query: query.query, views: query.views, leads: query.leads })),
      completeness: completeness(master),
      recentLeads: await cabinetLeads(ctx, master.id, incoming.leads.slice(0, 4)),
      benchmarks: { responseTimeMin: master.responseTimeMin, cityResponseTimeMin: benchmarks?.avgResponseMin ?? master.responseTimeMin, priceIndex },
      unansweredReviews: rating?.unanswered ?? 0,
    } satisfies C.CabinetOverview;
  },

  async cabinetAnalytics(ctx) {
    const period = (ctx.query.period as C.CabinetAnalytics['period'] | undefined) ?? '30d';
    const days = { '7d': 7, '30d': 30, '90d': 90 }[period];
    const master = await ownMaster(ctx);
    const [report, benchmarks] = await Promise.all([ctx.backends.analytics.getMasterReport({ masterId: master.id, days }), cityBenchmarks(ctx, master.cityId).catch(() => undefined)]);
    const counts = new Map<string, number>();
    for (const [source, count] of Object.entries(report.sources)) {
      const key = (SOURCES as readonly string[]).includes(source) ? source : 'direct';
      counts.set(key, (counts.get(key) ?? 0) + count);
    }
    const views = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const offset = utcOffsetHours(dto.timezoneOf(master.cityId));
    return {
      period,
      series: daily(report.series, days).map(({ date, impressions, views: dayViews, contacts, leads }) => ({ date, impressions, views: dayViews, contacts, leads })),
      sources: SOURCES.map((source) => ({ source, share: views ? round3((counts.get(source) ?? 0) / views) : 0 })),
      hours: Array.from({ length: 24 }, (_, hour) => report.hours[(hour - offset + 24) % 24] ?? 0),
      queries: report.queries.slice(0, 10).map((query) => ({ query: query.query, impressions: query.impressions, ctr: query.impressions ? round3(query.views / query.impressions) : 0, leads: query.leads })),
      // Индекс цены рынка — 1 по определению: цены сравниваются с медианой города
      competitors: { avgPriceIndex: 1, avgRating: benchmarks?.avgRating ?? 0, avgResponseMin: benchmarks?.avgResponseMin ?? 0 },
    } satisfies C.CabinetAnalytics;
  },

  cabinetProfile: profile,

  async updateCabinetProfile(ctx) {
    const body = ctx.body as C.UpdateProfile;
    await ctx.backends.catalog.updateProfile({
      masterId: masterIdOf(ctx),
      name: body.name,
      tagline: body.tagline,
      about: body.about,
      address: body.address,
      brandIds: body.brandIds,
      visitTypes: body.visitTypes,
      paymentMethods: body.paymentMethods,
      parts: body.partsQualities,
      warrantyDays: body.warrantyDays,
      express: body.express,
      expectedVersion: 0,
    });
    return profile(ctx);
  },

  async cabinetOffers(ctx) {
    return offersOf(ctx, await ownMaster(ctx));
  },

  /** UpsertOffers заменяет набор целиком: правки накладываются на текущие предложения, новые выключенные услуги не сохраняются. */
  async updateCabinetOffers(ctx) {
    const master = await ownMaster(ctx);
    const body = ctx.body as z.output<typeof C.UpdateOffers>;
    const available = new Set((await servicesFor(ctx, master.cityId)).map((service) => service.id));
    if (body.offers.some((offer) => offer.enabled && !available.has(offer.serviceId))) throw invalid('Услуга недоступна для подключения', 'service_unavailable');
    const incoming = new Set(body.offers.map((offer) => offer.serviceId));
    const own = new Set(master.offers.map((offer) => offer.serviceId));
    await ctx.backends.catalog.upsertOffers({
      masterId: master.id,
      offers: [
        ...master.offers.filter((offer) => !incoming.has(offer.serviceId)),
        ...body.offers
          .filter((offer) => offer.enabled || own.has(offer.serviceId))
          .map((offer) => ({ serviceId: offer.serviceId, priceFromMinor: offer.priceFrom * 100, priceToMinor: offer.priceTo * 100, durationMin: offer.durationMin, warrantyDays: offer.warrantyDays, parts: offer.parts, enabled: offer.enabled })),
      ],
    });
    return offersOf(ctx, await ownMaster(ctx));
  },

  async cabinetSchedule(ctx) {
    return scheduleOf(await ownMaster(ctx));
  },

  /** Центр зоны — геокод адреса профиля; здесь меняются график, приём заявок, отпуск, радиус и форматы визита. */
  async updateCabinetSchedule(ctx) {
    const body = ctx.body as Omit<C.CabinetSchedule, 'timezone'>;
    await ctx.backends.catalog.setSchedule({
      masterId: masterIdOf(ctx),
      schedule: body.schedule.map((day, weekday) => ({ weekday, open: day?.open ?? '', close: day?.close ?? '', dayOff: day === null })),
      acceptingLeads: body.acceptingLeads,
      serviceRadiusKm: body.zone.radiusKm,
      vacationFrom: body.vacation?.from ?? '',
      vacationTo: body.vacation?.to ?? '',
      visitTypes: body.zone.visitTypes,
    });
    return scheduleOf(await ownMaster(ctx));
  },

  async cabinetLeads(ctx) {
    const masterId = masterIdOf(ctx);
    const { leads } = await ctx.backends.leads.listMasterLeads({ context: ctx.rpc('master'), masterId, statuses: [], page: { cursor: '', limit: 50 } });
    return cabinetLeads(ctx, masterId, leads);
  },

  async respondToLead(ctx) {
    const body = ctx.body as C.RespondToLead;
    const { lead } = await ctx.backends.leads.respondToLead({
      context: ctx.rpc('master'),
      leadId: ctx.params.id!,
      masterId: masterIdOf(ctx),
      price: { fromMinor: body.priceFrom * 100, toMinor: body.priceTo === null ? undefined : body.priceTo * 100 },
      message: body.message,
      etaMin: body.etaMin ?? 0,
    });
    return cabinetLead(ctx, lead!);
  },

  async declineLead(ctx) {
    const { lead } = await ctx.backends.leads.declineLead({ context: ctx.rpc('master'), leadId: ctx.params.id!, masterId: masterIdOf(ctx), reason: String(ctx.body.reason ?? '') });
    return cabinetLead(ctx, lead!);
  },

  async setLeadStatus(ctx) {
    const status = ctx.body.status === 'completed' ? L.LeadStatus.LEAD_STATUS_COMPLETED : L.LeadStatus.LEAD_STATUS_IN_PROGRESS;
    const { lead } = await ctx.backends.leads.changeLeadStatus({ context: ctx.rpc('master'), leadId: ctx.params.id!, status });
    return cabinetLead(ctx, lead!);
  },

  async cabinetReviews(ctx) {
    const page = await ctx.backends.reviews.listReviews({ masterId: masterIdOf(ctx), sort: 'new', withPhotos: false, page: { cursor: '', limit: 50 } });
    return page.reviews.map(dto.review);
  },

  async replyToReview(ctx) {
    const { review } = await ctx.backends.reviews.replyToReview({ context: ctx.rpc('master'), reviewId: ctx.params.id!, masterId: masterIdOf(ctx), text: String(ctx.body.text) });
    return dto.review(review!);
  },

  async cabinetTeam(ctx) {
    return teamOf(await ownMaster(ctx));
  },

  /** Телефон сотрудника хранит catalog зашифрованным и отдельно от профиля; в ответе его нет. */
  async inviteStaff(ctx) {
    const body = ctx.body as z.output<typeof C.InviteStaff>;
    const master = await ownMaster(ctx);
    if (body.branchId && !(dto.profileOf(master).branches ?? []).some((branch) => branch.id === body.branchId)) throw invalid('Филиал не найден', 'unknown_branch');
    const { master: updated } = await ctx.backends.catalog.addStaff({ masterId: master.id, name: body.name, phone: body.phone, role: body.role, branchId: body.branchId ?? '' });
    return teamOf(updated!);
  },

  async removeStaff(ctx) {
    const { master } = await ctx.backends.catalog.removeStaff({ masterId: masterIdOf(ctx), staffId: ctx.params.id! });
    return teamOf(master!);
  },

  /** Тариф и продвижение действуют до даты оплаченного счёта; показы в рекламных слотах — из аналитики за 30 дней. */
  async cabinetBilling(ctx) {
    const masterId = masterIdOf(ctx);
    const [billing, report] = await Promise.all([ctx.backends.catalog.getBilling({ masterId }), ctx.backends.analytics.getMasterReport({ masterId, days: 30 }).catch(() => undefined)]);
    const until = billing.promotionUntil || null;
    return {
      plan: billing.plan === 'pro' ? 'pro' : 'free',
      planUntil: billing.planUntil || null,
      promotion: { active: !!until && Date.parse(until) > Date.now(), until, impressions: report ? report.series.reduce((sum, point) => sum + point.promoted, 0) : 0 },
      invoices: billing.invoices.map(dto.invoice),
    } satisfies C.CabinetBilling;
  },

  /** Только внешний счёт: сумму считает catalog по прайсу, оплата — переводом по реквизитам, на сайте платежей нет. */
  async requestInvoice(ctx) {
    const body = ctx.body as C.RequestInvoice;
    const { invoice } = await ctx.backends.catalog.requestInvoice({ masterId: masterIdOf(ctx), product: body.product, payer: body.payer, inn: body.inn, email: body.email });
    return dto.invoice(invoice!);
  },
};
