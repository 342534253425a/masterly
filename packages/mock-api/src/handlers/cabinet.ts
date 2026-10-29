import type { CabinetLead, CabinetOffer, CabinetSchedule, CabinetTeam, Invoice, Kpi, Review } from '@masterly/contracts';
import { MODELS, offersFor, reviewsFor, Rng, serviceById, type MasterFixture } from '@masterly/fixtures';
import { getDb, newId } from '../db.js';
import { MockHttpError, notFound, on, requireMaster } from '../http.js';
import { invalidateOffers, offersOf, toMasterLite, toMasterProfile, toReview } from '../mappers.js';
import { clearPriceStats } from '../search.js';
import { dates, delta, series, sum } from '../series.js';
import { toCabinetLead } from '../views.js';

const nowIso = () => new Date().toISOString();

function masterOf(session: Parameters<typeof requireMaster>[0]): MasterFixture {
  const { masterId } = requireMaster(session);
  const master = getDb().masterById.get(masterId);
  if (!master) throw notFound('Профиль мастера');
  return master;
}

function incomingLeads(masterId: string): CabinetLead[] {
  return [...getDb().leads.values()]
    .filter((lead) => lead.recipients.some((r) => r.masterId === masterId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((lead) => toCabinetLead(lead, masterId));
}

function leadOf(masterId: string, leadId: string) {
  const lead = getDb().leads.get(leadId);
  const recipient = lead?.recipients.find((r) => r.masterId === masterId);
  if (!lead || !recipient) throw notFound('Заявка');
  return { lead, recipient };
}

function marketMedianFrom(serviceId: string, cityId: string): number {
  const prices = getDb()
    .masters.filter((m) => m.cityId === cityId && !m.duplicateOf)
    .flatMap((m) => offersOf(m).filter((o) => o.serviceId === serviceId).map((o) => o.priceFrom))
    .sort((a, b) => a - b);
  return prices[Math.floor(prices.length / 2)] ?? 0;
}

function cabinetOffers(master: MasterFixture): CabinetOffer[] {
  const effective = new Map(offersOf(master).map((o) => [o.serviceId, o]));
  const db = getDb();
  return offersFor(master).map((base) => {
    const current = effective.get(base.serviceId);
    const factor = db.priceFactors.get(`${master.id}:${base.serviceId}`) ?? 1;
    const override = db.offerOverrides.get(`${master.id}:${base.serviceId}`);
    return {
      serviceId: base.serviceId,
      enabled: Boolean(current),
      priceFrom: current?.priceFrom ?? Math.round((base.priceFrom * factor) / 100) * 100,
      priceTo: current?.priceTo ?? Math.round((base.priceTo * factor) / 100) * 100,
      durationMin: override?.durationMin ?? base.durationMin,
      warrantyDays: override?.warrantyDays ?? base.warrantyDays,
      parts: override?.parts ?? base.parts,
      marketMedian: marketMedianFrom(base.serviceId, master.cityId),
    };
  });
}

function scheduleOf(master: MasterFixture): CabinetSchedule {
  const override = getDb().scheduleOverrides.get(master.id);
  return {
    schedule: [...master.schedule],
    acceptingLeads: override?.acceptingLeads ?? true,
    vacation: override?.vacation ?? null,
    timezone: 'Europe/Moscow',
    zone: { center: master.location, radiusKm: override?.radiusKm ?? 6, visitTypes: master.visitTypes },
  };
}

function teamOf(master: MasterFixture): CabinetTeam {
  const db = getDb();
  let team = db.teams.get(master.id);
  if (!team) {
    team = {
      staff: master.staff.map((s) => ({ id: s.id, name: s.name, role: s.role, experienceYears: s.experienceYears, branchId: null })),
      branches: master.branches.map((b) => ({ id: b.id, name: b.name, address: b.address, districtName: b.name.split(' · ')[1] ?? '' })),
      // Как в catalog (AddStaff): владелец место не занимает; Free — 2 сотрудника, Pro — 10
      seats: { used: master.staff.filter((s) => s.role !== 'owner').length, limit: master.plan === 'pro' ? 10 : 2 },
    };
    db.teams.set(master.id, team);
  }
  return team;
}

const PRICES: Record<Invoice['product'], number> = { pro_month: 2490, pro_year: 23900, promotion_week: 1290 };

function reviewsOf(master: MasterFixture): Review[] {
  const db = getDb();
  return [
    ...db.createdReviews.filter((r) => r.masterId === master.id),
    ...reviewsFor(master, 24).map((r) => toReview(r, db.reviewReplies.get(r.id))),
  ];
}

export const cabinetHandlers = [
  on('cabinetOverview', ({ session }) => {
    const master = masterOf(session);
    const { stats30d: s, id } = master;
    const impressions = series(`imp:${id}`, 30, s.impressions / 30);
    const views = series(`views:${id}`, 30, s.views / 30);
    const contacts = series(`contacts:${id}`, 30, s.contactClicks / 30, { noise: 0.35 });
    const leads = series(`leads:${id}`, 30, Math.max(0.8, s.leads / 30), { noise: 0.45 });
    const conversion = views.map((v, i) => (v ? Number(((leads[i] ?? 0) / v).toFixed(3)) : 0));
    const kpis: Kpi[] = [
      { key: 'impressions', value: sum(impressions), delta: delta(impressions), series: impressions },
      { key: 'views', value: sum(views), delta: delta(views), series: views },
      { key: 'contacts', value: sum(contacts), delta: delta(contacts), series: contacts },
      { key: 'leads', value: sum(leads), delta: delta(leads), series: leads },
      { key: 'conversion', value: Number((sum(leads) / Math.max(1, sum(views))).toFixed(3)), delta: delta(conversion), series: conversion },
      { key: 'response', value: master.responseTimeMin, delta: -0.14, series: series(`resp:${id}`, 30, master.responseTimeMin, { trend: -0.25, noise: 0.3 }) },
    ];
    const totalLeads = sum(leads);
    const rng = new Rng(`top:${id}`);
    const weights = master.serviceIds.map((serviceId) => [serviceId, (serviceById.get(serviceId)?.demand ?? 0.2) * rng.float(0.6, 1.4)] as const);
    const weightSum = weights.reduce((acc, [, w]) => acc + w, 0);
    const topServices = weights
      .map(([serviceId, w]) => ({ serviceId, name: serviceById.get(serviceId)?.name ?? serviceId, leads: Math.round((w / weightSum) * totalLeads), share: Number((w / weightSum).toFixed(3)) }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 5);
    const models = MODELS.filter((m) => master.brandIds.includes(m.brandId) && m.tier >= 3);
    const topQueries = topServices.slice(0, 4).flatMap((service, i) => {
      const fixture = serviceById.get(service.serviceId);
      const model = models[(i * 7) % models.length];
      const views = Math.round(s.views * service.share * rng.float(0.5, 0.9));
      return fixture && model ? [{ query: `${fixture.problem} ${model.name.toLowerCase()}`, views, leads: Math.max(1, Math.round(views * rng.float(0.04, 0.09))) }] : [];
    });
    const missing = [
      ...(master.photos.length < 8 ? [{ key: 'photos', label: 'Добавьте ещё фото выполненных работ', impact: 12 }] : []),
      ...(!master.verification.business ? [{ key: 'business', label: 'Подтвердите статус ИП или самозанятого', impact: 10 }] : []),
      ...(!master.verification.address ? [{ key: 'address', label: 'Подтвердите адрес мастерской', impact: 8 }] : []),
      ...(!master.telegram ? [{ key: 'telegram', label: 'Укажите Telegram для быстрой связи', impact: 4 }] : []),
      { key: 'models', label: 'Отметьте поддерживаемые модели устройств', impact: 6 },
    ];
    const cityMasters = getDb().masters.filter((m) => m.cityId === master.cityId);
    return {
      master: toMasterLite(master),
      plan: master.plan,
      kpis,
      funnel: [
        { stage: 'impressions' as const, value: sum(impressions) },
        { stage: 'views' as const, value: sum(views) },
        { stage: 'contacts' as const, value: sum(contacts) },
        { stage: 'leads' as const, value: totalLeads },
        { stage: 'completed' as const, value: Math.round(totalLeads * 0.64) },
      ],
      topServices,
      topQueries,
      completeness: { score: Math.min(100, 100 - missing.reduce((acc, m) => acc + m.impact, 0) + 6), missing },
      recentLeads: incomingLeads(master.id).slice(0, 4),
      benchmarks: {
        responseTimeMin: master.responseTimeMin,
        cityResponseTimeMin: Math.round(cityMasters.reduce((acc, m) => acc + m.responseTimeMin, 0) / cityMasters.length),
        priceIndex: master.priceLevel,
      },
      unansweredReviews: reviewsOf(master).filter((r) => !r.reply).length,
    };
  }),

  on('cabinetAnalytics', ({ session, query }) => {
    const master = masterOf(session);
    const days = query.period === '7d' ? 7 : query.period === '90d' ? 90 : 30;
    const s = master.stats30d;
    const impressions = series(`a-imp:${master.id}:${days}`, days, s.impressions / 30);
    const views = series(`a-views:${master.id}:${days}`, days, s.views / 30);
    const contacts = series(`a-contacts:${master.id}:${days}`, days, s.contactClicks / 30, { noise: 0.35 });
    const leads = series(`a-leads:${master.id}:${days}`, days, Math.max(0.8, s.leads / 30), { noise: 0.45 });
    const labels = dates(days);
    const rng = new Rng(`queries:${master.id}`);
    const cityMasters = getDb().masters.filter((m) => m.cityId === master.cityId);
    return {
      period: query.period,
      series: labels.map((date, i) => ({ date, impressions: impressions[i] ?? 0, views: views[i] ?? 0, contacts: contacts[i] ?? 0, leads: leads[i] ?? 0 })),
      sources: [
        { source: 'search' as const, share: 0.46 },
        { source: 'map' as const, share: 0.21 },
        { source: 'seo' as const, share: 0.17 },
        { source: 'compare' as const, share: 0.09 },
        { source: 'direct' as const, share: 0.07 },
      ],
      hours: Array.from({ length: 24 }, (_, h) => Math.round(Math.max(0.02, Math.exp(-((h - 13) ** 2) / 18) + 0.8 * Math.exp(-((h - 19.5) ** 2) / 6)) * 100)),
      queries: master.serviceIds.slice(0, 8).flatMap((serviceId) => {
        const service = serviceById.get(serviceId);
        if (!service) return [];
        const imp = rng.int(300, 4200);
        const ctr = Number(rng.float(0.04, 0.16).toFixed(3));
        return [{ query: service.problem, impressions: imp, ctr, leads: Math.round(imp * ctr * rng.float(0.15, 0.35)) }];
      }),
      competitors: {
        avgPriceIndex: 1,
        avgRating: Number((cityMasters.reduce((acc, m) => acc + m.rating, 0) / cityMasters.length).toFixed(2)),
        avgResponseMin: Math.round(cityMasters.reduce((acc, m) => acc + m.responseTimeMin, 0) / cityMasters.length),
      },
    };
  }),

  on('cabinetProfile', ({ session }) => toMasterProfile(masterOf(session))),

  on('updateCabinetProfile', ({ session, body }) => {
    const master = masterOf(session);
    Object.assign(master, {
      name: body.name,
      tagline: body.tagline,
      about: body.about,
      address: body.address,
      telegram: body.telegram,
      brandIds: body.brandIds,
      visitTypes: body.visitTypes,
      paymentMethods: body.paymentMethods,
      partsQualities: body.partsQualities,
      warrantyDays: body.warrantyDays,
      express: body.express,
    });
    invalidateOffers(master);
    clearPriceStats();
    return toMasterProfile(master);
  }),

  on('cabinetOffers', ({ session }) => cabinetOffers(masterOf(session))),

  on('updateCabinetOffers', ({ session, body }) => {
    const master = masterOf(session);
    const db = getDb();
    const base = new Map(offersFor(master).map((o) => [o.serviceId, o]));
    const disabled = new Set(db.disabledServices.get(master.id) ?? []);
    for (const offer of body.offers) {
      const original = base.get(offer.serviceId);
      if (!original) continue;
      if (offer.enabled) disabled.delete(offer.serviceId);
      else disabled.add(offer.serviceId);
      if (original.priceFrom > 0) db.priceFactors.set(`${master.id}:${offer.serviceId}`, offer.priceFrom / original.priceFrom);
      db.offerOverrides.set(`${master.id}:${offer.serviceId}`, { durationMin: offer.durationMin, warrantyDays: offer.warrantyDays, parts: offer.parts });
    }
    db.disabledServices.set(master.id, disabled);
    invalidateOffers(master);
    clearPriceStats();
    return cabinetOffers(master);
  }),

  on('cabinetSchedule', ({ session }) => scheduleOf(masterOf(session))),

  on('updateCabinetSchedule', ({ session, body }) => {
    const master = masterOf(session);
    master.schedule = body.schedule;
    master.visitTypes = body.zone.visitTypes;
    getDb().scheduleOverrides.set(master.id, { acceptingLeads: body.acceptingLeads, vacation: body.vacation, radiusKm: body.zone.radiusKm });
    return scheduleOf(master);
  }),

  on('cabinetLeads', ({ session }) => incomingLeads(masterOf(session).id)),

  on('respondToLead', ({ session, params, body }) => {
    const db = getDb();
    const master = masterOf(session);
    const { lead, recipient } = leadOf(master.id, params.id);
    if (['cancelled', 'completed', 'expired', 'declined'].includes(recipient.status)) throw new MockHttpError(409, 'conflict', 'Заявка уже закрыта');
    const price = { from: body.priceFrom, to: body.priceTo };
    const existing = lead.responses.find((r) => r.masterId === master.id);
    if (existing) Object.assign(existing, { price, message: body.message, etaMin: body.etaMin });
    else lead.responses.push({ id: newId(), masterId: master.id, price, message: body.message, etaMin: body.etaMin, createdAt: nowIso(), status: 'pending' });
    recipient.status = 'responded';
    recipient.viewedAt ??= nowIso();
    if (['new', 'viewed'].includes(lead.status)) lead.status = 'responded';
    lead.updatedAt = nowIso();
    lead.timeline.push({ type: 'responded', at: nowIso(), actor: 'master', note: `${body.priceFrom} ₽${body.etaMin ? ` · ${body.etaMin} мин` : ''}` });
    let conversation = [...db.conversations.values()].find((c) => c.leadId === lead.id && c.masterId === master.id);
    if (!conversation) {
      conversation = { id: newId(), leadId: lead.id, clientId: lead.clientId, masterId: master.id, subject: serviceById.get(lead.serviceId)?.name ?? null, messages: [], readAt: { client: lead.createdAt, master: nowIso() } };
      db.conversations.set(conversation.id, conversation);
    }
    conversation.messages.push({ id: newId(), author: 'master', kind: 'offer', text: body.message, createdAt: nowIso(), clientId: null });
    db.notifications.set(lead.clientId, [
      { id: newId(), kind: 'lead', title: 'Мастер ответил на заявку', body: `${master.name}: от ${body.priceFrom} ₽`, href: `/orders/${lead.id}`, createdAt: nowIso(), read: false },
      ...(db.notifications.get(lead.clientId) ?? []),
    ]);
    return toCabinetLead(lead, master.id);
  }),

  on('declineLead', ({ session, params, body }) => {
    const master = masterOf(session);
    const { lead, recipient } = leadOf(master.id, params.id);
    recipient.status = 'declined';
    recipient.declineReason = body.reason;
    recipient.viewedAt ??= nowIso();
    if (lead.recipients.every((r) => r.status === 'declined')) lead.status = 'declined';
    lead.updatedAt = nowIso();
    return toCabinetLead(lead, master.id);
  }),

  on('setLeadStatus', ({ session, params, body }) => {
    const master = masterOf(session);
    const { lead, recipient } = leadOf(master.id, params.id);
    if (lead.acceptedMasterId !== master.id) throw new MockHttpError(409, 'not_selected', 'Клиент ещё не выбрал вас исполнителем');
    lead.status = body.status;
    recipient.status = body.status;
    lead.updatedAt = nowIso();
    lead.timeline.push({ type: body.status === 'in_progress' ? 'started' : 'completed', at: nowIso(), actor: 'master', note: null });
    return toCabinetLead(lead, master.id);
  }),

  on('cabinetReviews', ({ session }) => reviewsOf(masterOf(session))),

  on('replyToReview', ({ session, params, body }) => {
    const master = masterOf(session);
    const review = reviewsOf(master).find((r) => r.id === params.id);
    if (!review) throw notFound('Отзыв');
    const reply = { text: body.text, createdAt: nowIso() };
    getDb().reviewReplies.set(review.id, reply);
    const created = getDb().createdReviews.find((r) => r.id === review.id);
    if (created) created.reply = reply;
    return { ...review, reply };
  }),

  on('cabinetTeam', ({ session }) => teamOf(masterOf(session))),

  on('inviteStaff', ({ session, body }) => {
    const team = teamOf(masterOf(session));
    if (team.seats.used >= team.seats.limit) throw new MockHttpError(429, 'seats_limit', 'Все места на тарифе заняты — перейдите на Pro, чтобы добавить сотрудников');
    team.staff.push({ id: newId(), name: body.name, role: body.role, experienceYears: 0, branchId: body.branchId });
    team.seats.used = team.staff.filter((s) => s.role !== 'owner').length;
    return team;
  }),

  on('removeStaff', ({ session, params }) => {
    const team = teamOf(masterOf(session));
    const member = team.staff.find((s) => s.id === params.id);
    if (!member) throw notFound('Сотрудник');
    if (member.role === 'owner') throw new MockHttpError(409, 'owner_protected', 'Владельца удалить нельзя');
    team.staff = team.staff.filter((s) => s.id !== params.id);
    team.seats.used = team.staff.filter((s) => s.role !== 'owner').length;
    return team;
  }),

  on('cabinetBilling', ({ session }) => {
    const master = masterOf(session);
    const db = getDb();
    if (!db.invoices.has(master.id)) {
      db.invoices.set(master.id, [
        { id: newId(), number: 'СЧ-2026-00871', product: 'pro_month', amount: PRICES.pro_month, status: 'paid', issuedAt: new Date(Date.now() - 37 * 86_400_000).toISOString(), payer: `ИП ${master.staff[0]?.name ?? master.name}` },
        { id: newId(), number: 'СЧ-2026-01204', product: 'pro_month', amount: PRICES.pro_month, status: 'paid', issuedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(), payer: `ИП ${master.staff[0]?.name ?? master.name}` },
      ]);
    }
    return {
      plan: master.plan,
      planUntil: master.plan === 'pro' ? new Date(Date.now() + 23 * 86_400_000).toISOString() : null,
      promotion: { active: Boolean(master.promotion), until: master.promotion ? new Date(Date.now() + 4 * 86_400_000).toISOString() : null, impressions: master.promotion ? master.stats30d.impressions : 0 },
      invoices: db.invoices.get(master.id) ?? [],
    };
  }),

  on('requestInvoice', ({ session, body }) => {
    const master = masterOf(session);
    const db = getDb();
    const invoices = db.invoices.get(master.id) ?? [];
    const invoice: Invoice = {
      id: newId(),
      number: `СЧ-2026-${String(1300 + invoices.length * 17).padStart(5, '0')}`,
      product: body.product,
      amount: PRICES[body.product],
      status: 'issued',
      issuedAt: nowIso(),
      payer: body.payer,
    };
    db.invoices.set(master.id, [invoice, ...invoices]);
    return invoice;
  }),
];
