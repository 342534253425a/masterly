import { fileURLToPath } from 'node:url';
import { uuidv7 } from '@masterly/kernel';
import { createGrpcClient, loadMigrations, OutboxRelay, toRecord, type PromiseClient } from '@masterly/platform';
import { createTestResources, startTestMicroservice } from '@masterly/platform/testing';
import { leads } from '@masterly/proto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LeadsService, maskContacts } from './leads.service.js';
import { LeadsModule } from './module.js';
import { ensureMonthlyPartitions, uuidv7Bound } from './partitions.js';

const spec = { package: 'masterly.leads.v1', protoPath: 'masterly/leads/v1/leads.proto' };
const client = { userId: uuidv7(), role: 'client', requestId: '', locale: 'ru', ipHash: '', masterId: '', name: 'Алина' };
const masters = [uuidv7(), uuidv7(), uuidv7()];
const asMaster = (index: number) => ({ ...client, userId: uuidv7(), role: 'master', masterId: masters[index]! });
const policies = new Map<string, string>([[masters[2]!, 'chat_only']]);

const draft = (patch: Partial<leads.CreateLeadRequest> = {}): leads.CreateLeadRequest => ({
  context: client, idempotencyKey: uuidv7(), masterIds: [], broadcast: true, cityId: 'msk', serviceId: 'display', modelId: 'iphone-13',
  description: 'Разбил экран, сенсор работает частично. Звоните +7 916 123-45-67', urgency: 'today', visitType: 'workshop', preferredChannel: 'chat', sharePhone: false, photoIds: [],
  ...patch,
});

describe('leads', async () => {
  const resources = await createTestResources('leads', { migrations: await loadMigrations(fileURLToPath(new URL('../migrations', import.meta.url))) });
  await ensureMonthlyPartitions(resources.db);
  const acks: string[] = [];
  const matched: string[] = [];
  let server: { address: string; close(): Promise<void> };
  let api: PromiseClient<leads.LeadsServiceClient> & { close(): void };
  const relay = new OutboxRelay(resources.db, resources.bus, resources.logger);

  beforeAll(async () => {
    const module = LeadsModule.register(resources, {
      matcher: { match: async (criteria) => (matched.push(criteria.serviceId), masters.slice(0, 2)) },
      contacts: { contacts: async (masterId) => ({ phone: '+74957298231', telegram: '@ekranchik', policy: policies.get(masterId) ?? 'reveal' }) },
      erasureAck: async (userId) => void acks.push(userId),
    });
    server = await startTestMicroservice(module, spec);
    api = createGrpcClient<leads.LeadsServiceClient>({ target: 'leads', address: server.address, ...spec, service: 'LeadsService', defaultDeadlineMs: 5_000 });
  });
  afterAll(async () => {
    api.close();
    await server.close();
    await resources.db.close();
  });

  it('создание: подбор получателей, маскирование контактов, идемпотентность, событие', async () => {
    const request = draft();
    const { lead } = await api.createLead(request);
    expect(lead).toMatchObject({ status: leads.LeadStatus.LEAD_STATUS_NEW, recipients: [{ masterId: expect.any(String) }, { masterId: expect.any(String) }] });
    expect(lead!.description).not.toContain('916');
    expect(lead!.number).toMatch(/^M-\d{6}$/);
    expect(matched).toEqual(['display']);

    // Сетевой повтор клиента с тем же ключом — та же заявка, без второго подбора
    const repeated = await api.createLead(request);
    expect(repeated.lead!.id).toBe(lead!.id);
    expect(matched).toHaveLength(1);

    await relay.tick();
    expect(resources.bus.events('leads.lead.created.v1')).toEqual([expect.objectContaining({ leadId: lead!.id, clientId: client.userId, masterIds: expect.arrayContaining(lead!.recipients.map((r) => r.masterId)) })]);

    // Заявка попала в секцию своего месяца, а не в DEFAULT
    const part = await resources.db.query<{ part: string }>('SELECT tableoid::regclass::text AS part FROM leads WHERE id = $1', [lead!.id]);
    expect(part.rows[0]!.part).toMatch(/^leads_\d{6}$/);
  });

  it('жизненный цикл: просмотр → ответ → выбор мастера → в работе → выполнено', async () => {
    const { lead } = await api.createLead(draft({ broadcast: false, masterIds: masters.slice(0, 2) }));
    const leadId = lead!.id;

    const seen = await api.getLead({ context: asMaster(0), leadId });
    expect(seen.lead!.status).toBe(leads.LeadStatus.LEAD_STATUS_VIEWED);
    expect(seen.lead!.recipients).toHaveLength(1); // мастер видит только своё участие

    await api.respondToLead({ context: asMaster(0), leadId, masterId: masters[0]!, price: { fromMinor: 450_000, toMinor: 650_000 }, message: 'Оригинальный дисплей, 1 час', etaMin: 60 });
    await api.respondToLead({ context: asMaster(1), leadId, masterId: masters[1]!, price: { fromMinor: 390_000, toMinor: undefined }, message: 'Копия, гарантия 90 дней', etaMin: 90 });
    await expect(api.respondToLead({ context: asMaster(1), leadId, masterId: masters[1]!, price: undefined, message: '', etaMin: 0 })).rejects.toMatchObject({ reason: 'already_responded' });

    const forMaster = await api.getLead({ context: asMaster(1), leadId });
    expect(forMaster.lead!.responses).toHaveLength(1); // цены конкурентов скрыты

    const full = await api.getLead({ context: client, leadId });
    expect(full.lead!.responses).toHaveLength(2);
    const chosen = full.lead!.responses.find((r) => r.masterId === masters[0])!;

    const accepted = await api.acceptResponse({ context: client, leadId, responseId: chosen.id });
    expect(accepted.lead).toMatchObject({ status: leads.LeadStatus.LEAD_STATUS_ACCEPTED, acceptedMasterId: masters[0] });
    expect(accepted.lead!.recipients.find((r) => r.masterId === masters[1])!.status).toBe(leads.LeadStatus.LEAD_STATUS_EXPIRED);

    await expect(api.changeLeadStatus({ context: asMaster(1), leadId, status: leads.LeadStatus.LEAD_STATUS_IN_PROGRESS })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await api.changeLeadStatus({ context: asMaster(0), leadId, status: leads.LeadStatus.LEAD_STATUS_IN_PROGRESS });
    await expect(api.changeLeadStatus({ context: client, leadId, status: leads.LeadStatus.LEAD_STATUS_IN_PROGRESS })).rejects.toMatchObject({ reason: 'invalid_transition' });
    const done = await api.changeLeadStatus({ context: client, leadId, status: leads.LeadStatus.LEAD_STATUS_COMPLETED });
    expect(done.lead!.timeline.map((e) => e.type)).toEqual(['created', 'viewed', 'responded', 'responded', 'accepted', 'in_progress', 'completed']);

    while ((await relay.tick()) > 0);
    const changes = resources.bus.events('leads.lead.status_changed.v1').filter((e) => e.leadId === leadId).map((e) => `${e.fromStatus}→${e.toStatus}`);
    expect(changes).toEqual(['new→viewed', 'responded→accepted', 'accepted→in_progress', 'in_progress→completed']);
    expect(resources.bus.events('leads.lead.responded.v1').filter((e) => e.leadId === leadId)).toHaveLength(2);
  });

  it('списки: «мои заявки» и входящие мастера с курсором', async () => {
    const mine = await api.listClientLeads({ context: client, page: { cursor: '', limit: 1 } });
    expect(mine.leads).toHaveLength(1);
    const next = await api.listClientLeads({ context: client, page: { cursor: mine.page!.nextCursor, limit: 10 } });
    expect(next.leads.map((l) => l.id)).not.toContain(mine.leads[0]!.id);

    const inbox = await api.listMasterLeads({ context: asMaster(0), masterId: masters[0]!, statuses: [], page: { cursor: '', limit: 10 } });
    expect(inbox.leads.length).toBeGreaterThanOrEqual(2);
    const { counts } = await api.countClientLeads({ clientIds: [client.userId, uuidv7()] });
    expect(counts[client.userId]).toBeGreaterThanOrEqual(2);
    expect(Object.keys(counts)).toEqual([client.userId]);
    await expect(api.listMasterLeads({ context: asMaster(1), masterId: masters[0]!, statuses: [], page: undefined })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('контакты: политика мастера и журнал раскрытий', async () => {
    const revealed = await api.revealContacts({ context: client, masterId: masters[0]! });
    expect(revealed).toMatchObject({ phone: '+74957298231', telegram: '@ekranchik' });
    await expect(api.revealContacts({ context: client, masterId: masters[2]! })).rejects.toMatchObject({ code: 'FAILED_PRECONDITION', reason: 'contacts_chat_only' });
    await relay.tick();
    expect(resources.bus.events('leads.contact.revealed.v1')).toEqual([expect.objectContaining({ masterId: masters[0], userId: client.userId })]);
  });

  it('отмена клиентом и истечение просроченных заявок', async () => {
    const { lead } = await api.createLead(draft());
    const cancelled = await api.cancelLead({ context: client, leadId: lead!.id });
    expect(cancelled.lead!.status).toBe(leads.LeadStatus.LEAD_STATUS_CANCELLED);

    const { lead: stale } = await api.createLead(draft());
    await resources.db.query("UPDATE leads SET expires_at = now() - interval '1 minute' WHERE id = $1", [stale!.id]);
    const worker = new LeadsService(resources.db, resources.kv, { match: async () => [] }, { contacts: async () => ({ phone: '', telegram: '', policy: 'reveal' }) });
    expect(await worker.expireDue()).toBe(1);
    const { rows } = await resources.db.query<{ status: string }>('SELECT status FROM leads WHERE id = $1', [stale!.id]);
    expect(rows[0]!.status).toBe('expired');
  });

  it('удаление аккаунта клиента обезличивает заявки и подтверждается', async () => {
    await resources.bus.publish([toRecord('identity', { type: 'identity.account.deletion_requested.v1', key: client.userId, payload: { userId: client.userId, requestedAt: new Date().toISOString(), retainUntil: '2029-01-01T00:00:00Z', roles: ['ROLE_CLIENT'] } })]);
    await resources.bus.drain();
    const { rows } = await resources.db.query<{ description: string }>('SELECT DISTINCT description FROM leads WHERE client_id = $1', [client.userId]);
    expect(rows).toEqual([{ description: '[удалено по запросу пользователя]' }]);
    expect(acks).toEqual([client.userId]);
  });

  it('границы секций и маскирование', () => {
    expect(uuidv7Bound(Date.UTC(2026, 9, 1))).toBe(`${Date.UTC(2026, 9, 1).toString(16).padStart(12, '0').replace(/^(.{8})(.{4})$/, '$1-$2')}-7000-8000-000000000000`);
    expect(maskContacts('пишите на alina@example.com или 8-916-123-45-67')).toBe('пишите на [контакт скрыт] или [контакт скрыт]');
  });
});
