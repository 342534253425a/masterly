import { Session as SessionSchema, type DataExport, type Review, type Role } from '@masterly/contracts';
import { CITIES, DEMO_ACCOUNTS, modelById, plural, priceFor, Rng, serviceById } from '@masterly/fixtures';
import { maskPhone, normalizeRuPhone } from '@masterly/kernel';
import { HttpResponse, http } from 'msw';
import { defaultSettings, getDb, newId, nextLeadNumber, type DbConversation, type DbLead, type DbUser } from '../db.js';
import { clearSessionCookie, forbidden, MockHttpError, notFound, on, requireSession, sessionCookie, withCookie } from '../http.js';
import { initialsOf, toMasterCard } from '../mappers.js';
import { ensureModeration } from '../moderation.js';
import { searchMasters } from '../search.js';
import { shortName, toConversation, toLead, toLeadSummary, toMessage, toUser, viewerOf, type Viewer } from '../views.js';

const nowIso = () => new Date().toISOString();
const later = (ms: number) => new Date(Date.now() + ms).toISOString();

const settingsOf = (user: DbUser) => getDb().settings.get(user.id) ?? defaultSettings(user.cityId);

function sessionResponse(user: DbUser, role: Role) {
  user.activeRole = role;
  user.lastSeenAt = nowIso();
  return withCookie(SessionSchema.parse({ user: toUser(user, role), demo: true }), sessionCookie(user.id, role));
}

function ownLead(id: string, user: DbUser): DbLead {
  const lead = getDb().leads.get(id);
  if (!lead) throw notFound('Заявка');
  if (lead.clientId !== user.id) throw forbidden();
  return lead;
}

function ownConversation(id: string, user: DbUser, role: Role): { conversation: DbConversation; viewer: Viewer } {
  const conversation = getDb().conversations.get(id);
  if (!conversation) throw notFound('Диалог');
  const viewer = viewerOf(conversation, user, role);
  if (!viewer) throw forbidden();
  return { conversation, viewer };
}

function notify(userId: string, notification: { kind: 'lead' | 'message' | 'review' | 'system'; title: string; body: string; href: string | null }) {
  const db = getDb();
  db.notifications.set(userId, [{ id: newId(), createdAt: nowIso(), read: false, ...notification }, ...(db.notifications.get(userId) ?? [])]);
}

/**
 * Демо-симуляция реального цикла: мастер видит заявку и отвечает.
 * В боевом контуре это события leads.lead.v1 → notifications/messaging через Kafka и WebSocket.
 */
function simulateMasterResponse(leadId: string) {
  const db = getDb();
  const lead = db.leads.get(leadId);
  const recipient = lead?.recipients.find((r) => r.masterId !== db.demoMasterId);
  if (!lead || !recipient) return;
  setTimeout(() => {
    if (lead.status !== 'new') return;
    recipient.status = 'viewed';
    recipient.viewedAt = nowIso();
    lead.status = 'viewed';
    lead.updatedAt = nowIso();
    lead.timeline.push({ type: 'viewed', at: nowIso(), actor: 'master', note: null });
  }, 4_000);
  setTimeout(() => {
    if (!['new', 'viewed'].includes(lead.status)) return;
    const master = db.masterById.get(recipient.masterId)!;
    const model = lead.modelId ? modelById.get(lead.modelId) : undefined;
    const price = model ? priceFor(master, lead.serviceId, model) : null;
    const etaMin = new Rng(lead.id).pick([20, 30, 40, 60]);
    lead.responses.push({
      id: newId(),
      masterId: master.id,
      price,
      message: `Здравствуйте! Можем помочь уже сегодня — запчасть в наличии, работа займёт около ${etaMin} минут. Приходите или вызовите курьера.`,
      etaMin,
      createdAt: nowIso(),
      status: 'pending',
    });
    recipient.status = 'responded';
    lead.status = 'responded';
    lead.updatedAt = nowIso();
    lead.timeline.push({ type: 'responded', at: nowIso(), actor: 'master', note: price ? `от ${price.from} ₽ · ${etaMin} мин` : null });
    notify(lead.clientId, { kind: 'lead', title: 'Мастер ответил на заявку', body: `${master.name} предложил цену и срок`, href: `/orders/${lead.id}` });
  }, 9_000);
}

const AUTO_REPLIES = [
  'Получили ваше сообщение! Мастер ответит в течение пары минут.',
  'Да, конечно. Можем подъехать к вам или ждём в мастерской — как удобнее?',
  'Отлично, записали вас. Если планы изменятся — напишите сюда.',
];

export const userHandlers = [
  on('session', ({ session }) => ({ user: session ? toUser(session.user, session.role) : null, demo: true })),

  on('otpRequest', ({ body }) => {
    const phone = normalizeRuPhone(body.phone);
    if (!phone) throw new MockHttpError(422, 'invalid_phone', 'Проверьте номер телефона');
    const requestId = newId();
    getDb().otp.set(requestId, { phone, code: '1234', expiresAt: Date.now() + 5 * 60_000 });
    return { requestId, phoneMasked: maskPhone(phone), expiresInSec: 300, resendInSec: 45, demoCode: '1234' };
  }),

  on('otpVerify', ({ body }) => {
    const db = getDb();
    const challenge = db.otp.get(body.requestId);
    if (!challenge || challenge.expiresAt < Date.now()) throw new MockHttpError(410, 'otp_expired', 'Код устарел — запросите новый');
    if (challenge.code !== body.code) throw new MockHttpError(422, 'otp_invalid', 'Неверный код. В демо-режиме код — 1234');
    db.otp.delete(body.requestId);
    let user = [...db.users.values()].find((u) => u.phone === challenge.phone);
    if (!user) {
      user = {
        id: newId(), name: 'Новый пользователь', phone: challenge.phone, email: null, roles: ['client'], activeRole: 'client',
        masterId: null, cityId: 'msk', createdAt: nowIso(), hue: new Rng(challenge.phone).int(0, 359), status: 'active', lastSeenAt: nowIso(),
      };
      db.users.set(user.id, user);
    }
    return sessionResponse(user, user.activeRole);
  }),

  on('demoLogin', ({ body }) => {
    const user = getDb().users.get(DEMO_ACCOUNTS[body.role].id);
    if (!user) throw notFound('Демо-аккаунт');
    return sessionResponse(user, body.role);
  }),

  on('logout', () => withCookie({ ok: true }, clearSessionCookie)),

  on('settings', ({ session }) => settingsOf(requireSession(session).user)),

  on('updateSettings', ({ session, body }) => {
    const { user } = requireSession(session);
    const next = { ...settingsOf(user), ...body };
    getDb().settings.set(user.id, next);
    if (body.cityId) user.cityId = body.cityId;
    return next;
  }),

  on('favorites', ({ session }) => {
    const db = getDb();
    const ids = db.favorites.get(requireSession(session).user.id) ?? new Set<string>();
    return [...ids].flatMap((id) => {
      const master = db.masterById.get(id);
      return master ? [toMasterCard(master)] : [];
    });
  }),

  on('addFavorite', ({ session, params }) => {
    const db = getDb();
    const { user } = requireSession(session);
    if (!db.masterById.has(params.id)) throw notFound('Мастер');
    db.favorites.set(user.id, new Set([...(db.favorites.get(user.id) ?? []), params.id]));
    return { ok: true as const };
  }),

  on('removeFavorite', ({ session, params }) => {
    getDb().favorites.get(requireSession(session).user.id)?.delete(params.id);
    return { ok: true as const };
  }),

  on('notifications', ({ session }) =>
    [...(getDb().notifications.get(requireSession(session).user.id) ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  ),

  on('readNotifications', ({ session }) => {
    for (const notification of getDb().notifications.get(requireSession(session).user.id) ?? []) notification.read = true;
    return { ok: true as const };
  }),

  on('exportData', ({ session }): DataExport => {
    const db = getDb();
    const { user } = requireSession(session);
    const settings = settingsOf(user);
    return {
      exportedAt: nowIso(),
      format: 'masterly.personal-data.v1',
      user: toUser(user),
      settings,
      favorites: [...(db.favorites.get(user.id) ?? [])],
      leads: [...db.leads.values()].filter((l) => l.clientId === user.id).map((l) => ({ ...toLeadSummary(l), description: l.description })),
      reviews: db.createdReviews.filter((r) => r.author.name === shortName(user.name)).map((r) => ({ ...r })),
      consentLog: Object.entries(settings.consents).map(([consent, granted]) => ({ consent, granted, at: user.createdAt })),
    };
  }),

  on('deleteAccount', ({ session }) => {
    requireSession(session);
    const day = 86_400_000;
    return {
      scheduledAt: later(30 * day),
      retained: [
        { data: 'Метаданные переписки (факт отправки и получения сообщений)', until: later(365 * day), basis: '149-ФЗ, ст. 10.1 — 1 год' },
        { data: 'Содержимое сообщений', until: later(182 * day), basis: '149-ФЗ, ст. 10.1 — 6 месяцев' },
        { data: 'Журнал согласий на обработку персональных данных', until: later(3 * 365 * day), basis: 'ГК РФ, ст. 196 — срок исковой давности' },
      ],
    };
  }),

  on('leads', ({ session }) => {
    const { user } = requireSession(session);
    return [...getDb().leads.values()]
      .filter((l) => l.clientId === user.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(toLeadSummary);
  }),

  on('lead', ({ session, params }) => toLead(ownLead(params.id, requireSession(session).user))),

  on('createLead', ({ session, body, request }) => {
    const db = getDb();
    const { user } = requireSession(session);
    const idempotencyKey = request.headers.get('Idempotency-Key');
    const existing = idempotencyKey ? db.leads.get(db.idempotency.get(idempotencyKey) ?? '') : undefined;
    if (existing) return toLead(existing);

    const service = serviceById.get(body.serviceId);
    if (!service) throw notFound('Услуга');
    const city = CITIES.find((c) => c.id === body.cityId) ?? CITIES[0]!;
    let recipients = body.masterIds.map((id) => db.masterById.get(id)).filter((m) => m !== undefined);
    if (recipients.length === 0 || body.broadcast) {
      const result = searchMasters({ city: city.slug, service: service.slug, model: body.modelId ?? undefined, sort: 'relevance', limit: 5 });
      recipients = result.items.map((item) => db.masterById.get(item.id)!);
      const demo = db.masterById.get(db.demoMasterId)!;
      if (city.id === demo.cityId && demo.serviceIds.includes(service.id) && !recipients.includes(demo)) recipients = [demo, ...recipients.slice(0, 4)];
    }
    if (recipients.length === 0) throw new MockHttpError(422, 'no_masters', 'Не нашли подходящих мастеров — попробуйте изменить параметры');

    const now = nowIso();
    const lead: DbLead = {
      id: newId(),
      number: nextLeadNumber(),
      clientId: user.id,
      cityId: city.id,
      serviceId: service.id,
      modelId: body.modelId ?? null,
      description: body.description,
      urgency: body.urgency,
      visitType: body.visitType,
      preferredChannel: body.preferredChannel,
      sharePhone: body.sharePhone,
      status: 'new',
      createdAt: now,
      updatedAt: now,
      expiresAt: later(72 * 3_600_000),
      recipients: recipients.map((m) => ({ masterId: m.id, status: 'new' as const, viewedAt: null })),
      responses: [],
      timeline: [
        { type: 'created', at: now, actor: 'client', note: null },
        { type: 'sent', at: now, actor: 'system', note: `Отправлено ${recipients.length} ${plural(recipients.length, 'мастеру', 'мастерам', 'мастерам')}` },
      ],
      acceptedMasterId: null,
      conversationId: null,
      reviewId: null,
    };
    db.leads.set(lead.id, lead);
    if (idempotencyKey) db.idempotency.set(idempotencyKey, lead.id);
    const masterUser = [...db.users.values()].find((u) => u.masterId === db.demoMasterId);
    if (masterUser && recipients.some((m) => m.id === db.demoMasterId)) {
      notify(masterUser.id, { kind: 'lead', title: 'Новая заявка', body: `${service.name}${lead.modelId ? ` · ${modelById.get(lead.modelId)?.name}` : ''}`, href: '/cabinet/leads' });
    }
    simulateMasterResponse(lead.id);
    return toLead(lead);
  }),

  on('cancelLead', ({ session, params }) => {
    const lead = ownLead(params.id, requireSession(session).user);
    if (['completed', 'cancelled'].includes(lead.status)) throw new MockHttpError(409, 'conflict', 'Заявку уже нельзя отменить');
    lead.status = 'cancelled';
    lead.updatedAt = nowIso();
    for (const recipient of lead.recipients) recipient.status = 'cancelled';
    lead.timeline.push({ type: 'cancelled', at: nowIso(), actor: 'client', note: null });
    return toLead(lead);
  }),

  on('acceptResponse', ({ session, params }) => {
    const db = getDb();
    const { user } = requireSession(session);
    const lead = ownLead(params.id, user);
    const response = lead.responses.find((r) => r.id === params.responseId);
    if (!response) throw notFound('Ответ мастера');
    for (const r of lead.responses) r.status = r.id === response.id ? 'accepted' : 'declined';
    for (const recipient of lead.recipients) recipient.status = recipient.masterId === response.masterId ? 'accepted' : 'expired';
    lead.status = 'accepted';
    lead.acceptedMasterId = response.masterId;
    lead.updatedAt = nowIso();
    lead.timeline.push({ type: 'accepted', at: nowIso(), actor: 'client', note: db.masterById.get(response.masterId)?.name ?? null });
    let conversation = [...db.conversations.values()].find((c) => c.leadId === lead.id && c.masterId === response.masterId);
    if (!conversation) {
      const service = serviceById.get(lead.serviceId);
      conversation = {
        id: newId(), leadId: lead.id, clientId: user.id, masterId: response.masterId,
        subject: `${service?.name ?? 'Ремонт'}${lead.modelId ? ` · ${modelById.get(lead.modelId)?.name}` : ''}`,
        messages: [{ id: newId(), author: 'system', kind: 'system', text: 'Клиент выбрал мастера. Договоритесь о времени и месте ремонта.', createdAt: nowIso(), clientId: null }],
        readAt: { client: nowIso(), master: lead.createdAt },
      };
      db.conversations.set(conversation.id, conversation);
    }
    lead.conversationId = conversation.id;
    return toLead(lead);
  }),

  on('completeLead', ({ session, params }) => {
    const lead = ownLead(params.id, requireSession(session).user);
    if (!lead.acceptedMasterId) throw new MockHttpError(409, 'conflict', 'Сначала выберите мастера');
    lead.status = 'completed';
    lead.updatedAt = nowIso();
    for (const recipient of lead.recipients) if (recipient.masterId === lead.acceptedMasterId) recipient.status = 'completed';
    lead.timeline.push({ type: 'completed', at: nowIso(), actor: 'client', note: null });
    return toLead(lead);
  }),

  on('createReview', ({ session, body }): Review => {
    const db = getDb();
    const { user } = requireSession(session);
    const lead = ownLead(body.leadId, user);
    if (lead.status !== 'completed' || !lead.acceptedMasterId) throw new MockHttpError(409, 'lead_not_completed', 'Отзыв можно оставить после завершения ремонта');
    if (lead.reviewId) throw new MockHttpError(409, 'already_reviewed', 'Вы уже оставили отзыв');
    const master = db.masterById.get(lead.acceptedMasterId)!;
    const service = serviceById.get(lead.serviceId);
    const model = lead.modelId ? modelById.get(lead.modelId) : undefined;
    const review: Review = {
      id: newId(),
      masterId: master.id,
      author: { name: shortName(user.name), initials: initialsOf(user.name) },
      rating: body.rating,
      text: body.text,
      service: { id: lead.serviceId, name: service?.name ?? lead.serviceId },
      model: model ? { id: model.id, name: model.name } : null,
      createdAt: nowIso(),
      verified: true,
      photos: 0,
      helpful: 0,
      reply: null,
    };
    db.createdReviews.unshift(review);
    lead.reviewId = review.id;
    lead.timeline.push({ type: 'reviewed', at: nowIso(), actor: 'client', note: `★${body.rating}` });
    master.ratingDistribution[body.rating - 1] = (master.ratingDistribution[body.rating - 1] ?? 0) + 1;
    master.reviewsCount += 1;
    master.rating = Number((master.ratingDistribution.reduce((sum, n, i) => sum + n * (i + 1), 0) / master.reviewsCount).toFixed(1));
    return review;
  }),

  on('createReport', ({ session, body }) => {
    const { user } = requireSession(session);
    const id = newId();
    ensureModeration().set(id, {
      id,
      kind: body.subjectType === 'review' ? 'review' : body.subjectType === 'photo' ? 'photo' : 'profile',
      status: 'pending',
      createdAt: nowIso(),
      title: `Жалоба пользователя: ${body.reason}`,
      content: body.note ?? 'Без комментария',
      riskScore: 0.5,
      reasons: [{ code: 'user_report', label: `Жалоба от ${shortName(user.name)}`, weight: 0.5 }],
      master: null,
      author: shortName(user.name),
    });
    return { id };
  }),

  on('conversations', ({ session }) => {
    const { user, role } = requireSession(session);
    const viewer: Viewer = role === 'master' ? 'master' : 'client';
    return [...getDb().conversations.values()]
      .filter((c) => (viewer === 'master' ? c.masterId !== null && c.masterId === user.masterId : c.clientId === user.id))
      .map((c) => toConversation(c, viewer))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }),

  on('startConversation', ({ session, body }) => {
    const db = getDb();
    const { user } = requireSession(session);
    const master = db.masterById.get(body.masterId);
    if (!master) throw notFound('Мастер');
    let conversation = [...db.conversations.values()].find((c) => c.clientId === user.id && c.masterId === master.id && c.leadId === body.leadId);
    if (!conversation) {
      conversation = { id: newId(), leadId: body.leadId, clientId: user.id, masterId: master.id, subject: null, messages: [], readAt: { client: nowIso(), master: nowIso() } };
      db.conversations.set(conversation.id, conversation);
    }
    return toConversation(conversation, 'client');
  }),

  on('messages', ({ session, params, query }) => {
    const { user, role } = requireSession(session);
    const { conversation, viewer } = ownConversation(params.id, user, role);
    conversation.readAt[viewer] = nowIso();
    const before = query.cursor ? conversation.messages.findIndex((m) => m.id === query.cursor) : conversation.messages.length;
    const start = Math.max(0, before - 50);
    return {
      conversation: toConversation(conversation, viewer),
      items: conversation.messages.slice(start, before).map((m) => toMessage(m, conversation, viewer)),
      nextCursor: start > 0 ? (conversation.messages[start]?.id ?? null) : null,
    };
  }),

  on('sendMessage', ({ session, params, body }) => {
    const { user, role } = requireSession(session);
    const { conversation, viewer } = ownConversation(params.id, user, role);
    const duplicate = conversation.messages.find((m) => m.clientId === body.clientId);
    if (duplicate) return toMessage(duplicate, conversation, viewer);
    const message = { id: newId(), author: viewer, kind: 'text' as const, text: body.text, createdAt: nowIso(), clientId: body.clientId };
    conversation.messages.push(message);
    conversation.readAt[viewer] = message.createdAt;
    if (viewer === 'client') {
      const replyIndex = conversation.messages.filter((m) => m.author !== 'client').length;
      setTimeout(() => {
        conversation.readAt.master = nowIso();
        conversation.messages.push({
          id: newId(),
          author: conversation.masterId ? 'master' : 'support',
          kind: 'text',
          text: conversation.masterId ? AUTO_REPLIES[replyIndex % AUTO_REPLIES.length]! : 'Спасибо за обращение! Оператор поддержки ответит в течение 5 минут.',
          createdAt: nowIso(),
          clientId: null,
        });
      }, 2_500);
    }
    return toMessage(message, conversation, viewer);
  }),

  on('createUpload', ({ body }) => {
    const uploadId = newId();
    return { uploadId, url: `/api/v1/media/mock-upload/${uploadId}`, expiresAt: later(15 * 60_000), headers: { 'Content-Type': body.contentType } };
  }),

  on('track', () => ({ ok: true as const })),

  // В демо-режиме push-сервера нет: подписка принимается, но уведомления показываются только в ленте
  on('pushConfig', () => ({ enabled: false, publicKey: null })),
  on('pushSubscribe', ({ session }) => (requireSession(session), { ok: true as const })),
  on('pushUnsubscribe', ({ session }) => (requireSession(session), { ok: true as const })),

  http.put('*/v1/media/mock-upload/:id', () => new HttpResponse(null, { status: 200 })),
];
