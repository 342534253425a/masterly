import { fileURLToPath } from 'node:url';
import { uuidv7 } from '@masterly/kernel';
import { createGrpcClient, loadMigrations, toRecord, type PromiseClient } from '@masterly/platform';
import { createTestResources, startTestMicroservice } from '@masterly/platform/testing';
import type { platform } from '@masterly/proto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotificationsModule } from './module.js';
import { NotificationsService, type ChannelSender } from './notifications.service.js';

const spec = { package: 'masterly.platform.v1', protoPath: 'masterly/platform/v1/platform.proto' };
const clientId = uuidv7();
const masterId = uuidv7();
const leadId = uuidv7();
const asMaster = { userId: uuidv7(), role: 'master', requestId: '', locale: 'ru', ipHash: '', masterId, name: '' };
const asClient = { ...asMaster, userId: clientId, role: 'client', masterId: '' };

describe('notifications', async () => {
  const resources = await createTestResources('notifications', { migrations: await loadMigrations(fileURLToPath(new URL('../migrations', import.meta.url))) });
  const sent: Array<{ channel: string; recipient: string; title: string }> = [];
  let failNext = false;
  const sender: ChannelSender = {
    async send(channel, recipient, draft) {
      if (failNext) {
        failNext = false;
        throw new Error('провайдер недоступен');
      }
      sent.push({ channel, recipient, title: draft.title });
    },
  };
  const acks: string[] = [];
  const service = new NotificationsService(resources.db, sender);
  let server: { address: string; close(): Promise<void> };
  let api: PromiseClient<platform.NotificationsServiceClient> & { close(): void };

  beforeAll(async () => {
    server = await startTestMicroservice(NotificationsModule.register(resources, { sender, erasureAck: async (id) => void acks.push(id) }), spec);
    api = createGrpcClient<platform.NotificationsServiceClient>({ target: 'notifications', address: server.address, ...spec, service: 'NotificationsService', defaultDeadlineMs: 5_000 });
  });
  afterAll(async () => {
    api.close();
    await server.close();
    await resources.db.close();
  });

  it('заявка: мастер получает уведомление в ленту и доставки по каналам; повтор события не дублирует', async () => {
    const created = toRecord('leads', { type: 'leads.lead.created.v1', key: leadId, payload: { leadId, clientId, masterIds: [masterId], serviceId: 'display', modelId: '', cityId: 'msk', urgency: 'today', createdAt: '' } });
    await resources.bus.publish([created, created]);
    await resources.bus.drain();
    const { notifications } = await api.listInbox({ context: asMaster });
    expect(notifications).toEqual([expect.objectContaining({ kind: 'lead_new', title: 'Новая заявка', read: false, href: `/cabinet/leads/${leadId}` })]);
    const deliveries = await resources.db.query<{ channel: string }>('SELECT channel FROM deliveries WHERE recipient = $1 ORDER BY channel', [`master:${masterId}`]);
    expect(deliveries.rows.map((row) => row.channel)).toEqual(['email', 'push']);
  });

  it('тихие часы откладывают доставку, а не теряют её', async () => {
    const night = new Date('2026-10-28T20:30:00Z'); // 23:30 по Москве
    await resources.db.transaction((tx) => service.enqueue(tx, uuidv7(), [{ recipient: `user:${clientId}`, kind: 'lead_response', title: 'Мастер ответил', body: '', href: '' }], night));
    const { rows } = await resources.db.query<{ scheduled_for: Date }>("SELECT scheduled_for FROM deliveries WHERE recipient = $1 AND channel = 'push'", [`user:${clientId}`]);
    expect(new Date(rows[0]!.scheduled_for).toISOString()).toBe('2026-10-29T05:00:00.000Z'); // 08:00 по Москве
  });

  it('рассылка: отправка созревших, повтор с отсрочкой при сбое провайдера', async () => {
    failNext = true;
    await service.dispatchDue();
    const retry = await resources.db.query<{ attempts: number; status: string }>("SELECT attempts, status FROM deliveries WHERE recipient = $1 AND attempts > 0", [`master:${masterId}`]);
    expect(retry.rows).toContainEqual({ attempts: 1, status: 'scheduled' });
    expect(sent.some((item) => item.recipient === `master:${masterId}`)).toBe(true);
  });

  it('настройки: каналы и тихие часы применяются и к мастерской пользователя', async () => {
    const { preferences } = await api.getPreferences({ context: asMaster });
    const updated = await api.updatePreferences({
      context: asMaster,
      preferences: { ...preferences!, quietHoursEnabled: false, events: { ...preferences!.events, message: { channels: ['in_app'] } } },
    });
    expect(updated.preferences).toMatchObject({ quietHoursEnabled: false, events: { message: { channels: ['in_app'] } } });
    const masterPrefs = await resources.db.query("SELECT 1 FROM preferences WHERE recipient = $1 AND quiet_enabled = false", [`master:${masterId}`]);
    expect(masterPrefs.rowCount).toBe(1);
    await expect(api.updatePreferences({ context: asMaster, preferences: { ...updated.preferences!, quietStart: '25:00' } })).rejects.toMatchObject({ reason: 'invalid_quiet_hours' });
  });

  it('выполненная заявка просит отзыв, «прочитать всё», удаление аккаунта', async () => {
    await resources.bus.publish([toRecord('leads', { type: 'leads.lead.status_changed.v1', key: leadId, payload: { leadId, masterId, clientId, fromStatus: 'in_progress', toStatus: 'completed', actor: 'master', at: '' } })]);
    await resources.bus.drain();
    expect((await api.listInbox({ context: asClient })).notifications[0]!.kind).toBe('review_request');
    await api.markAllRead({ context: asClient });
    expect((await api.listInbox({ context: asClient })).notifications.every((n) => n.read)).toBe(true);

    await resources.bus.publish([toRecord('identity', { type: 'identity.account.deletion_requested.v1', key: clientId, payload: { userId: clientId, requestedAt: '', retainUntil: '', roles: [] } })]);
    await resources.bus.drain();
    expect((await api.listInbox({ context: asClient })).notifications).toHaveLength(0);
    expect(acks).toEqual([clientId]);
  });
});
