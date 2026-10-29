import { fileURLToPath } from 'node:url';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { DEMO_ACCOUNTS, pickDemoMaster } from '@masterly/fixtures';
import { createFieldCipher, createGrpcClient, DEV_FIELD_KEY, loadMigrations, OutboxRelay, toRecord, type PromiseClient } from '@masterly/platform';
import { createTestResources, startTestMicroservice } from '@masterly/platform/testing';
import type { catalog } from '@masterly/proto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CatalogModule } from './module.js';

const spec = { package: 'masterly.catalog.v1', protoPath: 'masterly/catalog/v1/catalog.proto' };
const demo = pickDemoMaster();

describe('catalog', async () => {
  const resources = await createTestResources('catalog', {
    migrations: await loadMigrations(fileURLToPath(new URL('../migrations', import.meta.url))),
    extensions: { pg_trgm },
  });
  const acks: string[] = [];
  let server: { address: string; close(): Promise<void> };
  let client: PromiseClient<catalog.CatalogServiceClient> & { close(): void };
  const relay = new OutboxRelay(resources.db, resources.bus, resources.logger);
  const publishAll = async () => {
    while ((await relay.tick()) > 0);
  };

  beforeAll(async () => {
    const module = CatalogModule.register(resources, {
      cipher: createFieldCipher(DEV_FIELD_KEY),
      erasureAck: async (userId) => void acks.push(userId),
      seedDemo: true,
    });
    server = await startTestMicroservice(module, spec);
    client = createGrpcClient<catalog.CatalogServiceClient>({ target: 'catalog', address: server.address, ...spec, service: 'CatalogService', defaultDeadlineMs: 5_000 });
    await publishAll();
  });
  afterAll(async () => {
    client.close();
    await server.close();
    await resources.db.close();
  });

  it('сид публикует снимок каждого мастера в catalog.master.v1', () => {
    const snapshots = resources.bus.events('catalog.master.upserted.v1');
    expect(snapshots).toHaveLength(208);
    expect(snapshots.find((s) => s.masterId === demo.id)).toMatchObject({ ownerUserId: DEMO_ACCOUNTS.master.id, status: 'published', version: 1 });
    expect(snapshots[0]!.offers[0]!.tierPricesMinor).toHaveLength(5);
  });

  it('профиль по slug: телефон замаскирован, профиль и цены на месте', async () => {
    const { master } = await client.getMaster({ slug: demo.slug });
    expect(master).toMatchObject({ id: demo.id, name: demo.name, status: 'published' });
    expect(master!.phoneMasked).toContain('•');
    expect(master!.phoneMasked).not.toContain(demo.phone.slice(-7));
    expect(master!.offers.length).toBeGreaterThan(0);
    expect(JSON.parse(master!.profileJson).photos.length).toBeGreaterThan(0);
    await expect(client.getMaster({ slug: 'net-takogo' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('пакетная гидратация сохраняет порядок и пропускает неизвестные id', async () => {
    const ids = resources.bus.events('catalog.master.upserted.v1').slice(0, 3).map((s) => s.masterId);
    const { masters } = await client.batchGetMasters({ ids: [ids[2]!, '00000000-0000-7000-8000-000000000000', ids[0]!, ids[1]!] });
    expect(masters.map((m) => m.id)).toEqual([ids[2], ids[0], ids[1]]);
  });

  it('оптимистичная блокировка профиля и снимок с новой версией', async () => {
    const { master } = await client.getMaster({ id: demo.id });
    const base = { masterId: demo.id, name: 'Экранчик Pro', tagline: master!.tagline, about: master!.about, address: master!.address, brandIds: master!.brandIds, visitTypes: master!.visitTypes, paymentMethods: master!.paymentMethods, parts: master!.parts, warrantyDays: 365, express: true };
    await expect(client.updateProfile({ ...base, expectedVersion: master!.version + 5 })).rejects.toMatchObject({ code: 'FAILED_PRECONDITION', reason: 'version_conflict' });

    const updated = await client.updateProfile({ ...base, expectedVersion: master!.version });
    expect(updated.master).toMatchObject({ name: 'Экранчик Pro', version: master!.version + 1, warrantyDays: 365 });
    expect((await client.getMaster({ id: demo.id })).master!.name).toBe('Экранчик Pro');

    await publishAll();
    expect(resources.bus.events('catalog.master.upserted.v1').at(-1)).toMatchObject({ masterId: demo.id, name: 'Экранчик Pro', version: master!.version + 1 });
  });

  it('цены: валидация и сегменты устройств', async () => {
    await expect(client.upsertOffers({ masterId: demo.id, offers: [{ serviceId: 'teleportaciya', priceFromMinor: 100, priceToMinor: 200, durationMin: 30, warrantyDays: 30, parts: [], enabled: true }] })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      reason: 'unknown_service',
    });
    const { offers } = await client.upsertOffers({ masterId: demo.id, offers: [{ serviceId: 'display', priceFromMinor: 300_000, priceToMinor: 1_100_000, durationMin: 60, warrantyDays: 180, parts: ['original'], enabled: true }] });
    expect(offers).toHaveLength(1);
    await publishAll();
    expect(resources.bus.events('catalog.master.upserted.v1').at(-1)!.offers[0]!.tierPricesMinor).toEqual([300_000, 500_000, 700_000, 900_000, 1_100_000]);
  });

  it('расписание и контакты', async () => {
    const { schedule } = await client.setSchedule({
      masterId: demo.id,
      acceptingLeads: true,
      serviceRadiusKm: 5,
      schedule: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, open: '10:00', close: '20:00', dayOff: false })), vacationFrom: '', vacationTo: '', visitTypes: [],
    });
    expect(schedule.filter((day) => day.dayOff).map((day) => day.weekday)).toEqual([5, 6]);
    await expect(client.setSchedule({ masterId: demo.id, acceptingLeads: true, serviceRadiusKm: 5, schedule: [{ weekday: 0, open: '21:00', close: '10:00', dayOff: false }], vacationFrom: '', vacationTo: '', visitTypes: [] })).rejects.toMatchObject({ reason: 'invalid_schedule' });

    const contacts = await client.getMasterContacts({ masterId: demo.id });
    expect(contacts).toMatchObject({ phone: demo.phone, policy: 'reveal', ownerUserId: DEMO_ACCOUNTS.master.id });
  });

  it('статистика цен по городу', async () => {
    const { stats } = await client.getPriceStats({ cityId: 'msk' });
    const display = stats.find((s) => s.serviceId === 'display')!;
    expect(display.masters).toBeGreaterThan(10);
    expect(display.p25Minor).toBeLessThanOrEqual(display.medianMinor);
    expect(display.medianMinor).toBeLessThanOrEqual(display.p75Minor);
  });

  it('решение модерации применяется один раз', async () => {
    const victim = resources.bus.events('catalog.master.upserted.v1').find((s) => s.masterId !== demo.id)!;
    const decision = toRecord('trust', { type: 'trust.moderation.decided.v1', key: victim.masterId, payload: { itemId: 'case-1', kind: 'duplicate', subjectId: victim.masterId, decision: 'merge', reasonCode: 'duplicate_phone', moderatorId: 'admin', at: '2026-10-28T12:00:00Z' } });
    await resources.bus.publish([decision, decision]);
    await resources.bus.drain();
    await expect(client.getMaster({ id: victim.masterId })).resolves.toMatchObject({ master: { status: 'merged' } });
    await publishAll();
    expect(resources.bus.events('catalog.master.upserted.v1').filter((s) => s.masterId === victim.masterId && s.status === 'merged')).toHaveLength(1);
  });

  it('справочники админки: категории со счётчиками, правка услуги сразу видна', async () => {
    const { categories } = await client.listCategories({});
    const phones = categories.find((category) => category.services > 0)!;
    expect(phones.masters).toBeGreaterThan(50);
    await expect(client.updateCategory({ id: phones.id, status: 'archived' })).rejects.toMatchObject({ reason: 'invalid_status' });
    expect((await client.updateCategory({ id: phones.id, status: 'soon' })).category!.status).toBe('soon');

    const { service } = await client.updateService({ id: 'display', name: 'Замена экрана', enabled: false });
    expect(service).toMatchObject({ name: 'Замена экрана', enabled: false });
    expect((await client.listServices({ categoryId: '' })).services.find((item) => item.id === 'display')!.enabled).toBe(false);
  });

  it('команда: места по тарифу, телефон сотрудника не попадает в профиль', async () => {
    const free = resources.bus.events('catalog.master.upserted.v1').find((s) => s.plan === 'free' && s.masterId !== demo.id && s.status === 'published')!;
    const staffBefore = JSON.parse((await client.getMaster({ id: free.masterId })).master!.profileJson).staff.filter((m: { role: string }) => m.role !== 'owner').length as number;
    const add = (name: string) => client.addStaff({ masterId: free.masterId, name, phone: '+79160000011', role: 'master', branchId: '' });
    for (let i = staffBefore; i < 2; i++) await add(`Сотрудник ${i}`);
    await expect(add('Лишний')).rejects.toMatchObject({ code: 'RESOURCE_EXHAUSTED', reason: 'seats_limit' });
    const { master } = await client.getMaster({ id: free.masterId });
    expect(master!.profileJson).not.toContain('79160000011');
    const added = JSON.parse(master!.profileJson).staff.find((m: { name: string }) => m.name.startsWith('Сотрудник'));
    if (added) expect(JSON.parse((await client.removeStaff({ masterId: free.masterId, staffId: added.id })).master!.profileJson).staff.some((m: { id: string }) => m.id === added.id)).toBe(false);
  });

  it('тариф по счёту: заявка → «оплачено» → Pro до даты, снимок в поиск; отпуск закрывает заявки', async () => {
    const free = resources.bus.events('catalog.master.upserted.v1').find((s) => s.plan === 'free' && s.status === 'published' && s.masterId !== demo.id)!;
    await expect(client.requestInvoice({ masterId: free.masterId, product: 'pro_month', payer: 'ИП Петров', inn: '123', email: 'a@b.ru' })).rejects.toMatchObject({ reason: 'invalid_inn' });
    const { invoice } = await client.requestInvoice({ masterId: free.masterId, product: 'pro_month', payer: 'ИП Петров', inn: '7701234567', email: 'buh@petrov.ru' });
    expect(invoice).toMatchObject({ status: 'issued', amountMinor: 249_000, number: expect.stringMatching(/^INV-\d{6}$/) });
    const paid = await client.markInvoicePaid({ invoiceId: invoice!.id });
    expect(paid.invoice!.status).toBe('paid');
    const billing = await client.getBilling({ masterId: free.masterId });
    expect(billing.plan).toBe('pro');
    expect(new Date(billing.planUntil).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    await publishAll();
    expect(resources.bus.events('catalog.master.upserted.v1').filter((s) => s.masterId === free.masterId).at(-1)!.plan).toBe('pro');

    const today = new Date().toISOString().slice(0, 10);
    await client.setSchedule({ masterId: free.masterId, acceptingLeads: true, serviceRadiusKm: 5, schedule: [], vacationFrom: today, vacationTo: today, visitTypes: ['workshop'] });
    await publishAll();
    expect(resources.bus.events('catalog.master.upserted.v1').filter((s) => s.masterId === free.masterId).at(-1)!.acceptingLeads).toBe(false);
    expect((await client.getMaster({ id: free.masterId })).master).toMatchObject({ vacationFrom: today, vacationTo: today, acceptingLeads: true });
  });

  it('статистика платформы по городам', async () => {
    const stats = await client.getPlatformStats({});
    expect(stats.cities.map((city) => city.cityId).sort()).toEqual(['krd', 'msk', 'spb']);
    expect(stats.mastersTotal).toBe(stats.cities.reduce((sum, city) => sum + city.masters, 0));
    expect(stats.verifiedTotal).toBeGreaterThan(0);
  });

  it('удаление аккаунта владельца: профиль скрыт, контакты стёрты, tombstone и подтверждение', async () => {
    await resources.bus.publish([
      toRecord('identity', { type: 'identity.account.deletion_requested.v1', key: DEMO_ACCOUNTS.master.id, payload: { userId: DEMO_ACCOUNTS.master.id, requestedAt: '2026-10-28T12:00:00Z', retainUntil: '2029-10-28T12:00:00Z', roles: ['ROLE_MASTER'] } }),
    ]);
    await resources.bus.drain();
    await expect(client.getMaster({ id: demo.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(client.getMasterContacts({ masterId: demo.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await publishAll();
    expect(resources.bus.events('catalog.master.deleted.v1')).toEqual([{ masterId: demo.id, reason: 'account_deleted' }]);
    expect(resources.bus.published.some((r) => r.key === demo.id && r.headers['x-tombstone'] === '1')).toBe(true);
    expect(acks).toEqual([DEMO_ACCOUNTS.master.id]);
  });
});
