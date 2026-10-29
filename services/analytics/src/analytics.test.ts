import { uuidv7 } from '@masterly/kernel';
import { createGrpcClient, toRecord, type PromiseClient } from '@masterly/platform';
import { createTestResources, startTestMicroservice } from '@masterly/platform/testing';
import type { platform } from '@masterly/proto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BatchWriter } from './batch.js';
import { AnalyticsModule } from './module.js';
import { MemoryWarehouse, type Warehouse } from './warehouse.js';

const spec = { package: 'masterly.platform.v1', protoPath: 'masterly/platform/v1/platform.proto' };
const masterId = uuidv7();
const userId = uuidv7();

describe('analytics', async () => {
  const resources = await createTestResources('analytics');
  const warehouse = new MemoryWarehouse();
  const acks: string[] = [];
  let server: { address: string; close(): Promise<void> };
  let api: PromiseClient<platform.AnalyticsServiceClient> & { close(): void };

  beforeAll(async () => {
    server = await startTestMicroservice(AnalyticsModule.register(resources, { warehouse, salt: 'test-salt', erasureAck: async (id) => void acks.push(id) }), spec);
    api = createGrpcClient<platform.AnalyticsServiceClient>({ target: 'analytics', address: server.address, ...spec, service: 'AnalyticsService', defaultDeadlineMs: 5_000 });
  });
  afterAll(async () => {
    api.close();
    await server.close();
    await resources.db.close();
  });

  it('потоки событий собираются в отчёт мастера: показы, просмотры, контакты, заявки', async () => {
    const now = new Date().toISOString();
    const search = (results: number, shown: string[], query = 'замена экрана') =>
      toRecord('search', { type: 'analytics.search.performed.v1', key: uuidv7(), payload: { searchId: uuidv7(), query, cityId: 'msk', serviceId: 'display', modelId: '', resultsCount: results, tookMs: 12, userHash: 'u', at: now, shownMasterIds: shown, promotedMasterIds: [] } });
    await resources.bus.publish([
      search(2, [masterId, uuidv7()]),
      search(1, [masterId]),
      search(0, [], 'ремонт квадрокоптера'),
      search(0, [], 'Ремонт квадрокоптера'),
      toRecord('gateway', { type: 'analytics.product.tracked.v1', key: 'u', payload: { name: 'profile_view', userHash: 'u', masterId, searchId: '', props: { source: 'search' }, at: now } }),
      toRecord('leads', { type: 'leads.contact.revealed.v1', key: masterId, payload: { masterId, userId, at: now } }),
      toRecord('leads', { type: 'leads.lead.created.v1', key: uuidv7(), payload: { leadId: uuidv7(), clientId: userId, masterIds: [masterId], serviceId: 'display', modelId: '', cityId: 'msk', urgency: 'today', createdAt: now } }),
    ]);
    await resources.bus.drain();

    const report = await api.getMasterReport({ masterId, days: 7 });
    expect(report.series).toEqual([{ date: now.slice(0, 10), impressions: 2, promoted: 0, views: 1, contacts: 1, leads: 1 }]);
    expect(report.sources).toEqual({ search: 1 });
    expect(report.hours).toHaveLength(24);
    expect(report.queries).toEqual([{ query: 'замена экрана', impressions: 2, views: 0, leads: 0 }]);
  });

  it('пробелы каталога: запросы без результатов по городу', async () => {
    const { gaps } = await api.getSearchGaps({ cityId: 'msk', days: 30, limit: 10 });
    expect(gaps).toEqual([{ query: 'ремонт квадрокоптера', cityId: 'msk', hits: 2 }]);
  });

  it('обзор платформы: поиски по дням, заявки по городам и услугам без двойного счёта получателей', async () => {
    const overview = await api.getPlatformOverview({ days: 30 });
    expect(overview.searches).toEqual([{ date: new Date().toISOString().slice(0, 10), total: 4, zeroResults: 2 }]);
    expect(overview).toMatchObject({ leadsByCity: { msk: 1 }, leadsByService: { display: 1 }, searchesByService: { display: 4 }, views: 1, contacts: 1, leads: 1 });
  });

  it('отзыв согласия и удаление аккаунта стирают данные по псевдониму', async () => {
    await resources.bus.publish([toRecord('identity', { type: 'identity.account.consent_changed.v1', key: userId, payload: { userId, analytics: false, personalization: false, marketing: false, policyVersion: 1, at: '' } })]);
    await resources.bus.drain();
    expect(warehouse.tables.events.filter((row) => row.name === 'contact_reveal')).toHaveLength(0);
    await resources.bus.publish([toRecord('identity', { type: 'identity.account.deletion_requested.v1', key: userId, payload: { userId, requestedAt: '', retainUntil: '', roles: [] } })]);
    await resources.bus.drain();
    expect(acks).toEqual([userId]);
  });

  it('пакетная запись: одна вставка на пакет, ошибка доходит до каждого ожидающего', async () => {
    const inserts: number[] = [];
    let fail = false;
    class Flaky extends MemoryWarehouse {
      override async insert(_table: 'events' | 'searches', rows: Record<string, unknown>[]): Promise<void> {
        if (fail) throw new Error('ClickHouse недоступен');
        inserts.push(rows.length);
      }
    }
    const target: Warehouse = new Flaky();
    const writer = new BatchWriter(target, 100, 20);
    await Promise.all(Array.from({ length: 30 }, (_, i) => writer.add('events', [{ i }])));
    expect(inserts).toEqual([30]);
    fail = true;
    await expect(Promise.all([writer.add('events', [{ a: 1 }]), writer.add('events', [{ b: 2 }])])).rejects.toThrow('ClickHouse недоступен');
  });
});
