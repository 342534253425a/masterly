import { fileURLToPath } from 'node:url';
import { uuidv7 } from '@masterly/kernel';
import { createGrpcClient, ensureMonthlyUuidPartitions, loadMigrations, OutboxRelay, toRecord, type PromiseClient } from '@masterly/platform';
import { createTestResources, startTestMicroservice } from '@masterly/platform/testing';
import type { messaging } from '@masterly/proto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MessagingModule } from './module.js';

const spec = { package: 'masterly.messaging.v1', protoPath: 'masterly/messaging/v1/messaging.proto' };
const clientId = uuidv7();
const masterId = uuidv7();
const leadId = uuidv7();
const asClient = { userId: clientId, role: 'client', requestId: '', locale: 'ru', ipHash: '', masterId: '', name: '' };
const asMaster = { ...asClient, userId: uuidv7(), role: 'master', masterId };

describe('messaging', async () => {
  const resources = await createTestResources('messaging', { migrations: await loadMigrations(fileURLToPath(new URL('../migrations', import.meta.url))) });
  await ensureMonthlyUuidPartitions(resources.db, ['messages']);
  const acks: string[] = [];
  let server: { address: string; close(): Promise<void> };
  let api: PromiseClient<messaging.MessagingServiceClient> & { close(): void };

  beforeAll(async () => {
    server = await startTestMicroservice(MessagingModule.register(resources, { erasureAck: async (userId) => void acks.push(userId) }), spec);
    api = createGrpcClient<messaging.MessagingServiceClient>({ target: 'messaging', address: server.address, ...spec, service: 'MessagingService', defaultDeadlineMs: 5_000 });
    await resources.bus.publish([
      toRecord('leads', { type: 'leads.lead.created.v1', key: leadId, payload: { leadId, clientId, masterIds: [masterId, uuidv7()], serviceId: 'display', modelId: '', cityId: 'msk', urgency: 'today', createdAt: '' } }),
      toRecord('leads', { type: 'leads.lead.responded.v1', key: leadId, payload: { leadId, masterId, responseId: uuidv7(), priceFromMinor: 450_000, etaMin: 60, clientId } }),
    ]);
    await resources.bus.drain();
  });
  afterAll(async () => {
    api.close();
    await server.close();
    await resources.db.close();
  });

  it('заявка открывает диалоги с получателями, ответ мастера — системное сообщение', async () => {
    const { conversations } = await api.listConversations({ context: asClient, page: undefined });
    expect(conversations).toHaveLength(2);
    const withMaster = conversations.find((c) => c.masterId === masterId)!;
    expect(withMaster.lastMessageText.replace(/\s/gu, ' ')).toBe('Мастер ответил: от 4 500 ₽, срок 60 мин');
    expect(withMaster.unread).toBe(2);
  });

  it('переписка: идемпотентная отправка, непрочитанные, курсор, доступ только участникам', async () => {
    const { conversations } = await api.listConversations({ context: asMaster, page: undefined });
    const conversation = conversations[0]!;
    const sent = await api.sendMessage({ context: asMaster, conversationId: conversation.id, text: 'Здравствуйте! Какая модель телефона?', clientId: 'c-1' });
    const again = await api.sendMessage({ context: asMaster, conversationId: conversation.id, text: 'Здравствуйте! Какая модель телефона?', clientId: 'c-1' });
    expect(again.message!.id).toBe(sent.message!.id);

    const before = (await api.listConversations({ context: asClient, page: undefined })).conversations.find((c) => c.id === conversation.id)!;
    expect(before.unread).toBe(3);
    const history = await api.listMessages({ context: asClient, conversationId: conversation.id, beforeId: '', limit: 2 });
    expect(history.messages.map((m) => m.kind)).toEqual(['system', 'text']);
    const older = await api.listMessages({ context: asClient, conversationId: conversation.id, beforeId: history.nextCursor, limit: 10 });
    expect(older.messages).toHaveLength(1);
    expect((await api.listConversations({ context: asClient, page: undefined })).conversations.find((c) => c.id === conversation.id)!.unread).toBe(0);

    const stranger = { ...asClient, userId: uuidv7() };
    await expect(api.listMessages({ context: stranger, conversationId: conversation.id, beforeId: '', limit: 10 })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await new OutboxRelay(resources.db, resources.bus, resources.logger).tick();
    expect(resources.bus.events('messaging.message.sent.v1')).toEqual([expect.objectContaining({ recipientId: `user:${clientId}`, preview: 'Здравствуйте! Какая модель телефона?' })]);
  });

  it('прямой диалог без заявки — один на пару клиент–мастер', async () => {
    const first = await api.startConversation({ context: asClient, masterId: uuidv7(), leadId: '' });
    const second = await api.startConversation({ context: asClient, masterId: first.conversation!.masterId, leadId: '' });
    expect(second.conversation!.id).toBe(first.conversation!.id);
  });

  it('удаление аккаунта стирает тексты автора', async () => {
    const conversation = (await api.listConversations({ context: asClient, page: undefined })).conversations.find((c) => c.masterId === masterId)!;
    await api.sendMessage({ context: asClient, conversationId: conversation.id, text: 'Мой номер 8 916 000 00 00', clientId: '' });
    await resources.bus.publish([toRecord('identity', { type: 'identity.account.deletion_requested.v1', key: clientId, payload: { userId: clientId, requestedAt: '', retainUntil: '', roles: [] } })]);
    await resources.bus.drain();
    const { messages } = await api.listMessages({ context: asMaster, conversationId: conversation.id, beforeId: '', limit: 10 });
    expect(messages.at(-1)!.text).toBe('[сообщение удалено]');
    expect(acks).toEqual([clientId]);
  });
});
