import type * as C from '@masterly/contracts';
import { cityById, modelById, serviceById } from '@masterly/fixtures';
import { openState, type WeeklySchedule } from '@masterly/kernel';
import type { catalog, identity, leads, messaging, platform, reviews } from '@masterly/proto';

/**
 * Протобуф доменных сервисов → DTO внешнего контракта (@masterly/contracts).
 * Шлюз — единственное место, где знают обе модели: сервисы не зависят от формы экранов, фронтенд — от gRPC.
 */

export const rub = (minor: number) => Math.round(minor / 100);
const EPOCH = new Date(0).toISOString();
const iso = (value: string | undefined | null, fallback = EPOCH) => (value ? new Date(value).toISOString() : fallback);
const oneOf = <T extends string>(values: readonly T[], value: string, fallback: T): T => (values.includes(value as T) ? (value as T) : fallback);

export function initialsOf(name: string): string {
  const words = name.replace(/[«»"]/g, '').split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? words[0]?.[1] ?? '')).toUpperCase() || '·';
}

export function hueOf(value: string): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}

export interface ProfileExtras {
  initials?: string;
  hue?: number;
  landmark?: string;
  photos?: Array<{ id: string; serviceId: string; modelId: string; caption: string }>;
  branches?: Array<{ id: string; name: string; districtId: string; address: string; location: { lat: number; lng: number } }>;
  staff?: Array<{ id: string; name: string; role: 'owner' | 'senior' | 'master' | 'manager'; experienceYears: number; branchId?: string | null }>;
  completedOrders?: number;
  responseRate?: number;
  joinedAt?: string;
  whatsapp?: boolean;
  ratingDistribution?: number[];
}

export const profileOf = (master: catalog.Master): ProfileExtras => {
  try {
    return JSON.parse(master.profileJson || '{}') as ProfileExtras;
  } catch {
    return {};
  }
};

export const districtName = (cityId: string, districtId: string) => cityById.get(cityId)?.districts.find((district) => district.id === districtId)?.name ?? '';
export const timezoneOf = (cityId: string) => cityById.get(cityId)?.timezone ?? 'Europe/Moscow';
export const partsOf = (parts: string[]) => parts.filter((part): part is C.PartsQuality => ['original', 'oem', 'copy'].includes(part));
export const paymentMethodsOf = (master: catalog.Master) => master.paymentMethods.filter((method): method is C.PaymentMethod => ['cash', 'card', 'sbp'].includes(method));

/** Цена для сегмента модели — линейная интерполяция «от–до» (так же, как сегменты в catalog). */
export const modelPriceMinor = (offer: catalog.Offer, tier: number) => Math.round(offer.priceFromMinor + ((Math.max(offer.priceToMinor, offer.priceFromMinor) - offer.priceFromMinor) * (tier - 1)) / 4);

export function offer(item: catalog.Offer, tier?: number): C.Offer {
  return {
    serviceId: item.serviceId,
    priceFrom: rub(item.priceFromMinor),
    priceTo: rub(Math.max(item.priceToMinor, item.priceFromMinor)),
    durationMin: item.durationMin,
    warrantyDays: item.warrantyDays,
    parts: partsOf(item.parts),
    modelPrice: tier ? { from: rub(modelPriceMinor(item, tier)), to: null } : null,
  };
}

export function weekly(schedule: catalog.DaySchedule[]): WeeklySchedule {
  return Array.from({ length: 7 }, (_, weekday) => {
    const day = schedule.find((item) => item.weekday === weekday);
    return day && !day.dayOff && day.open ? { open: day.open, close: day.close } : null;
  });
}

export interface CardExtras {
  distanceKm?: number | null;
  price?: { serviceId: string; modelId: string | null; fromMinor: number; toMinor?: number } | null;
  promoted?: boolean;
}

export function masterCard(master: catalog.Master, extra: CardExtras = {}): C.MasterCard {
  const profile = profileOf(master);
  const state = openState(weekly(master.schedule), timezoneOf(master.cityId));
  const verification = master.verification ?? { identity: false, business: false, address: false, reviewedAt: '' };
  return {
    id: master.id,
    slug: master.slug,
    kind: oneOf(['workshop', 'individual'], master.kind, 'workshop'),
    name: master.name,
    initials: profile.initials ?? initialsOf(master.name),
    hue: profile.hue ?? hueOf(master.id),
    tagline: master.tagline,
    cityId: master.cityId,
    districtName: districtName(master.cityId, master.districtId),
    landmark: profile.landmark ?? '',
    address: master.address,
    location: { lat: master.location?.lat ?? 0, lng: master.location?.lng ?? 0 },
    rating: master.rating,
    reviewsCount: master.reviewsCount,
    experienceYears: master.experienceYears,
    completedOrders: profile.completedOrders ?? 0,
    responseTimeMin: master.responseTimeMin,
    warrantyDays: master.warrantyDays,
    verified: verification.identity && verification.business,
    verification: { identity: verification.identity, business: verification.business, address: verification.address, reviewedAt: iso(verification.reviewedAt) },
    visitTypes: master.visitTypes.filter((type): type is C.VisitType => ['workshop', 'onsite', 'courier'].includes(type)),
    express: master.express,
    plan: master.plan === 'pro' ? 'pro' : 'free',
    promoted: (extra.promoted ?? !!master.promotionErid) && master.promotionErid ? { erid: master.promotionErid, advertiser: master.name } : null,
    openState: state.open
      ? { open: true, closesAt: state.closesAt, opensAt: null, inDays: null }
      : { open: false, closesAt: null, opensAt: state.opensAt, inDays: state.inDays },
    distanceKm: extra.distanceKm ?? null,
    price: extra.price ? { serviceId: extra.price.serviceId, modelId: extra.price.modelId, range: { from: rub(extra.price.fromMinor), to: extra.price.toMinor ? rub(extra.price.toMinor) : null } } : null,
    serviceIds: master.offers.filter((offer) => offer.enabled).map((offer) => offer.serviceId),
    photosCount: profile.photos?.length ?? 0,
  };
}

export function masterLite(master: catalog.Master | undefined, fallbackId = ''): C.MasterLite {
  if (!master) return { id: fallbackId || 'deleted', slug: 'deleted', name: 'Мастер', initials: 'М', hue: 0, rating: 0, reviewsCount: 0, verified: false, districtName: '', responseTimeMin: 0 };
  const card = masterCard(master);
  return { id: card.id, slug: card.slug, name: card.name, initials: card.initials, hue: card.hue, rating: card.rating, reviewsCount: card.reviewsCount, verified: card.verified, districtName: card.districtName, responseTimeMin: card.responseTimeMin };
}

export function masterProfile(master: catalog.Master, rating?: reviews.GetRatingSummaryResponse, modelId?: string): C.MasterProfile {
  const profile = profileOf(master);
  const fromReviews = rating && rating.reviewsCount > 0;
  const card = masterCard(fromReviews ? { ...master, rating: rating.rating, reviewsCount: rating.reviewsCount } : master);
  const tier = modelId ? modelById.get(modelId)?.tier : undefined;
  return {
    ...card,
    about: master.about,
    joinedAt: iso(profile.joinedAt),
    timezone: timezoneOf(master.cityId),
    ratingDistribution: fromReviews ? rating.distribution : (profile.ratingDistribution ?? [0, 0, 0, 0, 0]),
    responseRate: profile.responseRate ?? 0.9,
    brandIds: master.brandIds,
    paymentMethods: paymentMethodsOf(master),
    partsQualities: partsOf(master.parts),
    schedule: [...weekly(master.schedule)],
    photos: (profile.photos ?? []).map((photo) => ({ id: photo.id, serviceId: photo.serviceId, modelId: photo.modelId, caption: photo.caption, status: 'approved' as const })),
    branches: (profile.branches ?? []).map((branch) => ({ id: branch.id, name: branch.name, address: branch.address, districtName: districtName(master.cityId, branch.districtId), location: branch.location })),
    staff: (profile.staff ?? []).map((member) => ({ id: member.id, name: member.name, role: member.role, experienceYears: member.experienceYears })),
    offers: master.offers.filter((item) => item.enabled).map((item) => offer(item, tier)),
    contacts: { phoneMasked: master.phoneMasked, hasTelegram: master.hasTelegram, hasWhatsapp: !!profile.whatsapp },
  };
}

const ref = (id: string, name: string | undefined): C.Ref => ({ id, name: name ?? id });
export const serviceRef = (id: string) => ref(id, serviceById.get(id)?.name);
export const modelRef = (id: string) => (id ? ref(id, modelById.get(id)?.fullName) : null);

export function review(item: reviews.Review): C.Review {
  return {
    id: item.id,
    masterId: item.masterId,
    author: { name: item.authorName, initials: initialsOf(item.authorName) },
    rating: item.rating,
    text: item.text,
    service: serviceRef(item.serviceId),
    model: modelRef(item.modelId),
    createdAt: iso(item.createdAt),
    verified: item.verified,
    photos: item.photos,
    helpful: item.helpful,
    reply: item.replyText ? { text: item.replyText, createdAt: iso(item.replyAt) } : null,
  };
}

export const leadStatus = (status: string) => status.replace('LEAD_STATUS_', '').toLowerCase() as C.LeadStatus;

const EVENT_TYPES: Record<string, C.LeadEvent['type']> = { created: 'created', viewed: 'viewed', responded: 'responded', accepted: 'accepted', in_progress: 'started', completed: 'completed', cancelled: 'cancelled' };

export function leadResponse(item: leads.LeadResponse, masters: Map<string, catalog.Master>): C.LeadResponse {
  return {
    id: item.id,
    master: masterLite(masters.get(item.masterId), item.masterId),
    price: item.price ? { from: rub(item.price.fromMinor), to: item.price.toMinor !== undefined ? rub(item.price.toMinor) : null } : null,
    message: item.message,
    etaMin: item.etaMin || null,
    createdAt: iso(item.createdAt),
    status: item.status === 'accepted' ? 'accepted' : item.status === 'rejected' ? 'declined' : 'pending',
  };
}

export function leadSummary(item: leads.Lead, masters: Map<string, catalog.Master>): C.LeadSummary {
  const best = item.responses.reduce<leads.LeadResponse | undefined>((min, r) => (r.price && (!min?.price || r.price.fromMinor < min.price.fromMinor) ? r : min), undefined);
  return {
    id: item.id,
    number: item.number,
    status: leadStatus(item.status),
    service: serviceRef(item.serviceId),
    model: modelRef(item.modelId),
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
    recipientsCount: item.recipients.length,
    responsesCount: item.responses.length,
    bestPrice: best?.price ? { from: rub(best.price.fromMinor), to: best.price.toMinor !== undefined ? rub(best.price.toMinor) : null } : null,
    master: item.acceptedMasterId ? masterLite(masters.get(item.acceptedMasterId), item.acceptedMasterId) : null,
  };
}

export function lead(item: leads.Lead, masters: Map<string, catalog.Master>): C.Lead {
  const status = leadStatus(item.status);
  return {
    ...leadSummary(item, masters),
    description: item.description,
    urgency: oneOf(['asap', 'today', 'this_week', 'flexible'], item.urgency, 'flexible'),
    visitType: oneOf(['workshop', 'onsite', 'courier'], item.visitType, 'workshop'),
    preferredChannel: oneOf(['chat', 'call', 'telegram', 'whatsapp'], item.preferredChannel, 'chat'),
    sharePhone: item.sharePhone,
    cityId: item.cityId,
    recipients: item.recipients.map((recipient) => ({ master: masterLite(masters.get(recipient.masterId), recipient.masterId), status: leadStatus(recipient.status), viewedAt: recipient.viewedAt || null })),
    responses: item.responses.map((response) => leadResponse(response, masters)),
    timeline: item.timeline.flatMap((event) => {
      const type = EVENT_TYPES[event.type];
      return type ? [{ type, at: iso(event.at), actor: oneOf(['client', 'master', 'system'], event.actor, 'system'), note: event.note || null }] : [];
    }),
    conversationId: item.conversationId || null,
    canReview: status === 'completed' && !item.reviewId,
    reviewId: item.reviewId || null,
  };
}

/** Имя и телефон клиента мастер не видит до выбора (связь — через чат); число заявок клиента — сигнал «постоянный клиент». */
export function cabinetLead(item: leads.Lead, masterId: string, masters: Map<string, catalog.Master>, clientLeads: Record<string, number> = {}): C.CabinetLead {
  const mine = item.responses.find((response) => response.masterId === masterId);
  return {
    id: item.id,
    number: item.number,
    status: leadStatus(item.status),
    createdAt: iso(item.createdAt),
    expiresAt: iso(item.expiresAt),
    client: { name: 'Клиент', initials: 'К', phone: null, leadsCount: clientLeads[item.clientId] ?? 0 },
    service: serviceRef(item.serviceId),
    model: modelRef(item.modelId),
    description: item.description,
    urgency: oneOf(['asap', 'today', 'this_week', 'flexible'], item.urgency, 'flexible'),
    visitType: oneOf(['workshop', 'onsite', 'courier'], item.visitType, 'workshop'),
    distanceKm: null,
    myResponse: mine ? leadResponse(mine, masters) : null,
    competitors: Math.max(0, item.recipients.length - 1),
    conversationId: item.conversationId || null,
  };
}

const ROLE_NAMES: Record<string, C.Role> = { ROLE_CLIENT: 'client', ROLE_MASTER: 'master', ROLE_ADMIN: 'admin' };

export function user(item: identity.User): C.User {
  const roles = [...new Set(item.roles.map((role) => ROLE_NAMES[role]).filter((role): role is C.Role => !!role))];
  const name = item.name || 'Пользователь';
  return {
    id: item.id,
    name,
    initials: initialsOf(name),
    hue: hueOf(item.id),
    phoneMasked: item.phoneMasked,
    email: item.email || null,
    roles: roles.length ? roles : ['client'],
    activeRole: roles.includes('master') ? 'master' : roles.includes('admin') ? 'admin' : 'client',
    masterId: item.masterId || null,
    cityId: item.cityId || 'msk',
    createdAt: iso(item.createdAt),
  };
}

export function adminUser(item: identity.AdminUser, leadsCount: number): C.AdminUser {
  const base = user(item.user!);
  return {
    id: base.id,
    name: base.name,
    phoneMasked: base.phoneMasked,
    roles: base.roles,
    status: item.user!.status === 'blocked' ? 'blocked' : 'active',
    createdAt: base.createdAt,
    leadsCount,
    lastSeenAt: iso(item.lastSeenAt, base.createdAt),
  };
}

export function invoice(item: catalog.Invoice): C.Invoice {
  return {
    id: item.id,
    number: item.number,
    product: oneOf(['pro_month', 'pro_year', 'promotion_week'], item.product, 'pro_month'),
    amount: rub(item.amountMinor),
    status: oneOf(['issued', 'paid', 'cancelled'], item.status, 'issued'),
    issuedAt: iso(item.issuedAt),
    payer: item.payer,
  };
}

export function conversation(item: messaging.Conversation, viewerId: string, masters: Map<string, catalog.Master>): C.Conversation {
  const asClient = item.clientId === viewerId;
  const master = masters.get(item.masterId);
  const peer: C.Conversation['peer'] = asClient
    ? { id: item.masterId, name: master?.name ?? 'Мастер', initials: master ? initialsOf(master.name) : 'М', hue: hueOf(item.masterId), kind: 'master', slug: master?.slug ?? null, online: false }
    : { id: item.clientId, name: 'Клиент', initials: 'К', hue: hueOf(item.clientId), kind: 'client', slug: null, online: false };
  return {
    id: item.id,
    leadId: item.leadId || null,
    peer,
    subject: item.subject || null,
    lastMessage: item.lastMessageText ? { text: item.lastMessageText, at: iso(item.lastMessageAt), fromMe: false } : null,
    unread: item.unread,
    updatedAt: iso(item.lastMessageAt),
  };
}

export function message(item: messaging.Message, viewerId: string): C.Message {
  return {
    id: item.id,
    conversationId: item.conversationId,
    clientId: item.clientId || null,
    fromMe: item.authorId === viewerId,
    kind: item.kind === 'system' ? 'system' : 'text',
    text: item.text,
    createdAt: iso(item.createdAt),
    status: 'sent',
  };
}

const NOTIFICATION_KINDS: Record<string, C.Notification['kind']> = { lead_new: 'lead', lead_response: 'lead', lead_status: 'lead', review_request: 'lead', message: 'message', review_new: 'review', moderation: 'moderation' };

export function notification(item: platform.Notification): C.Notification {
  return { id: item.id, kind: NOTIFICATION_KINDS[item.kind] ?? 'system', title: item.title, body: item.body, href: item.href || null, createdAt: iso(item.createdAt), read: item.read };
}

const MODERATION_KINDS: Record<string, C.ModerationItem['kind']> = { review: 'review', duplicate: 'profile', master: 'profile', media: 'photo' };

export function moderationItem(item: platform.ModerationItem): C.ModerationItem {
  return {
    id: item.id,
    kind: MODERATION_KINDS[item.kind] ?? 'description',
    status: item.status === 'open' ? 'pending' : 'approved',
    createdAt: iso(item.createdAt),
    title: item.title,
    content: item.content,
    riskScore: Math.max(0, Math.min(1, item.riskScore)),
    reasons: item.reasons,
    master: null,
    author: null,
  };
}

const SIGNALS: Record<string, { code: C.DuplicateCandidate['signals'][number]['code']; label: string }> = {
  same_phone: { code: 'phone', label: 'Совпадает телефон' },
  similar_name: { code: 'name', label: 'Похожее название' },
  similar_text: { code: 'name', label: 'Похожее описание' },
  nearby: { code: 'geo', label: 'Рядом на карте' },
};

export function duplicate(item: platform.DuplicateCandidate, masters: Map<string, catalog.Master>): C.DuplicateCandidate {
  return {
    id: item.id,
    score: Math.max(0, Math.min(1, item.score)),
    a: masterLite(masters.get(item.masterAId), item.masterAId),
    b: masterLite(masters.get(item.masterBId), item.masterBId),
    signals: item.signals.flatMap((signal) => {
      const known = SIGNALS[signal.code];
      return known ? [{ ...known, value: signal.value, matched: signal.matched }] : [];
    }),
    status: oneOf(['open', 'merged', 'dismissed'], item.status, 'open'),
  };
}
