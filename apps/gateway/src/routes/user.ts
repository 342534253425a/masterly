import type * as C from '@masterly/contracts';
import type { z } from 'zod';
import { leads as L } from '@masterly/proto';
import * as dto from '../dto.js';
import type { Handlers } from '../http.js';
import { modelOf } from './reference.js';
import { clearTokens, mastersById, mastersOfLead } from './shared.js';

export const userHandlers: Handlers = {
  async notifications(ctx) {
    const { notifications } = await ctx.backends.notifications.listInbox({ context: ctx.rpc() });
    return notifications.map(dto.notification);
  },

  async readNotifications(ctx) {
    await ctx.backends.notifications.markAllRead({ context: ctx.rpc() });
    return { ok: true as const };
  },

  /** Удаление аккаунта: вход закрывается сразу, данные под обязательным хранением — до указанного срока (ADR-0011). */
  async deleteAccount(ctx) {
    const { scheduledAt } = await ctx.backends.identity.deleteAccount({ userId: ctx.user().userId });
    clearTokens(ctx);
    return {
      scheduledAt,
      retained: [{ data: 'Обезличенные заявки и переписка', until: scheduledAt, basis: 'Срок исковой давности по договорам оказания услуг' }],
    } satisfies C.AccountDeletion;
  },

  async leads(ctx) {
    const { leads } = await ctx.backends.leads.listClientLeads({ context: ctx.rpc('client'), page: { cursor: '', limit: 50 } });
    const masters = await mastersById(ctx.backends, leads.flatMap(mastersOfLead));
    return leads.map((lead) => dto.leadSummary(lead, masters));
  },

  async lead(ctx) {
    const { lead } = await ctx.backends.leads.getLead({ context: ctx.rpc('client'), leadId: ctx.params.id! });
    return dto.lead(lead!, await mastersById(ctx.backends, mastersOfLead(lead!)));
  },

  /** Ключ идемпотентности уходит и в leads: повтор защищён и на шлюзе (Redis), и в БД (уникальный индекс). */
  async createLead(ctx) {
    const body = ctx.body as C.CreateLead;
    const { lead } = await ctx.backends.leads.createLead({
      context: ctx.rpc('client'),
      idempotencyKey: ctx.idempotencyKey ?? '',
      masterIds: body.masterIds,
      broadcast: body.broadcast ?? false,
      cityId: body.cityId,
      serviceId: body.serviceId,
      modelId: body.modelId ? modelOf(body.modelId) || body.modelId : '',
      description: body.description,
      urgency: body.urgency,
      visitType: body.visitType,
      preferredChannel: body.preferredChannel,
      sharePhone: body.sharePhone,
      photoIds: body.photoIds ?? [],
    });
    return dto.lead(lead!, await mastersById(ctx.backends, mastersOfLead(lead!)));
  },

  async cancelLead(ctx) {
    const { lead } = await ctx.backends.leads.cancelLead({ context: ctx.rpc('client'), leadId: ctx.params.id! });
    return dto.lead(lead!, await mastersById(ctx.backends, mastersOfLead(lead!)));
  },

  async acceptResponse(ctx) {
    const { lead } = await ctx.backends.leads.acceptResponse({ context: ctx.rpc('client'), leadId: ctx.params.id!, responseId: ctx.params.responseId! });
    return dto.lead(lead!, await mastersById(ctx.backends, mastersOfLead(lead!)));
  },

  async completeLead(ctx) {
    const { lead } = await ctx.backends.leads.changeLeadStatus({ context: ctx.rpc('client'), leadId: ctx.params.id!, status: L.LeadStatus.LEAD_STATUS_COMPLETED });
    return dto.lead(lead!, await mastersById(ctx.backends, mastersOfLead(lead!)));
  },

  async createReview(ctx) {
    const body = ctx.body as C.CreateReview;
    const { review } = await ctx.backends.reviews.createReview({
      context: ctx.rpc('client'),
      leadId: body.leadId,
      rating: body.rating,
      text: body.text,
      deviceFingerprint: '',
      authorName: ctx.user().name || 'Клиент',
    });
    return dto.review(review!);
  },

  async conversations(ctx) {
    const { conversations } = await ctx.backends.messaging.listConversations({ context: ctx.rpc(), page: undefined });
    const masters = await mastersById(ctx.backends, conversations.map((item) => item.masterId));
    return conversations.map((item) => dto.conversation(item, ctx.user().userId, masters));
  },

  async startConversation(ctx) {
    const body = ctx.body as z.output<typeof C.StartConversation>;
    const { conversation } = await ctx.backends.messaging.startConversation({ context: ctx.rpc('client'), masterId: body.masterId, leadId: body.leadId ?? '' });
    return dto.conversation(conversation!, ctx.user().userId, await mastersById(ctx.backends, [body.masterId]));
  },

  async messages(ctx) {
    const page = await ctx.backends.messaging.listMessages({ context: ctx.rpc(), conversationId: ctx.params.id!, beforeId: String(ctx.query.cursor ?? ''), limit: 50 });
    const masters = await mastersById(ctx.backends, [page.conversation?.masterId ?? '']);
    return {
      conversation: dto.conversation(page.conversation!, ctx.user().userId, masters),
      items: page.messages.map((item) => dto.message(item, ctx.user().userId)),
      nextCursor: page.nextCursor || null,
    } satisfies C.MessagesPage;
  },

  async sendMessage(ctx) {
    const body = ctx.body as C.SendMessage;
    const { message } = await ctx.backends.messaging.sendMessage({ context: ctx.rpc(), conversationId: ctx.params.id!, text: body.text, clientId: body.clientId });
    return dto.message(message!, ctx.user().userId);
  },

  async createUpload(ctx) {
    const body = ctx.body as { contentType: string; size: number; purpose: string };
    const upload = await ctx.backends.media.createUpload({ context: ctx.rpc(), contentType: body.contentType, size: body.size, purpose: body.purpose });
    return { uploadId: upload.uploadId, url: upload.url, expiresAt: upload.expiresAt, headers: upload.headers };
  },
};
