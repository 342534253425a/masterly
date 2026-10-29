import { fileURLToPath } from 'node:url';
import { uuidv7 } from '@masterly/kernel';
import { createGrpcClient, loadMigrations, OutboxRelay, toRecord, type PromiseClient } from '@masterly/platform';
import { createTestResources, startTestMicroservice } from '@masterly/platform/testing';
import type { events, platform } from '@masterly/proto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TrustModule } from './module.js';

const spec = { package: 'masterly.platform.v1', protoPath: 'masterly/platform/v1/platform.proto' };
const admin = { userId: uuidv7(), role: 'admin', requestId: '', locale: 'ru', ipHash: '', masterId: '', name: '' };

function master(id: string, name: string, phoneHash: string, lat: number, lng: number): events.MasterUpserted {
  return {
    masterId: id, slug: id, cityId: 'msk', districtId: '', name, tagline: 'Ремонт телефонов за час с гарантией', lat, lng, rating: 4.8, reviewsCount: 10, responseTimeMin: 10,
    warrantyDays: 90, verified: false, express: false, plan: 'free', promotionErid: '', brandIds: [], visitTypes: [], parts: [], offers: [], openHours: [], completeness: 50,
    status: 'published', version: 1, phoneHash, ownerUserId: '', acceptingLeads: true, serviceRadiusKm: 10,
  };
}

describe('trust', async () => {
  const resources = await createTestResources('trust', { migrations: await loadMigrations(fileURLToPath(new URL('../migrations', import.meta.url))) });
  let server: { address: string; close(): Promise<void> };
  let api: PromiseClient<platform.TrustServiceClient> & { close(): void };
  const relay = new OutboxRelay(resources.db, resources.bus, resources.logger);
  const [a, b, c] = [uuidv7(), uuidv7(), uuidv7()];

  beforeAll(async () => {
    server = await startTestMicroservice(TrustModule.register(resources, { erasureAck: async () => undefined }), spec);
    api = createGrpcClient<platform.TrustServiceClient>({ target: 'trust', address: server.address, ...spec, service: 'TrustService', defaultDeadlineMs: 5_000 });
  });
  afterAll(async () => {
    api.close();
    await server.close();
    await resources.db.close();
  });

  it('дубликат профиля: тот же телефон, похожее название рядом', async () => {
    await resources.bus.publish([
      toRecord('catalog', { type: 'catalog.master.upserted.v1', key: a, payload: master(a, 'Сервисный центр Экранчик', 'phone-1', 55.7558, 37.6173) }),
      toRecord('catalog', { type: 'catalog.master.upserted.v1', key: b, payload: master(b, 'Сервисный центр «Экранчик»', 'phone-1', 55.7559, 37.6175) }),
      toRecord('catalog', { type: 'catalog.master.upserted.v1', key: c, payload: master(c, 'Мастерская Винтик', 'phone-2', 55.65, 37.4) }),
    ]);
    await resources.bus.drain();
    const { candidates } = await api.listDuplicateCandidates({ cityId: 'msk' });
    expect(candidates).toHaveLength(1);
    expect([candidates[0]!.masterAId, candidates[0]!.masterBId].sort()).toEqual([a, b].sort());
    expect(candidates[0]!.score).toBeGreaterThanOrEqual(0.8);
    expect(candidates[0]!.signals.filter((s) => s.matched).map((s) => s.code)).toEqual(expect.arrayContaining(['same_phone', 'similar_name', 'nearby']));

    await expect(api.resolveDuplicate({ context: { ...admin, role: 'client' }, candidateId: candidates[0]!.id, action: 'merge' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    const { candidate } = await api.resolveDuplicate({ context: admin, candidateId: candidates[0]!.id, action: 'merge' });
    expect(candidate!.status).toBe('merged');
    while ((await relay.tick()) > 0);
    expect(resources.bus.events('trust.moderation.decided.v1')).toEqual([expect.objectContaining({ kind: 'duplicate', decision: 'merge', subjectId: candidates[0]!.masterBId, moderatorId: admin.userId })]);
  });

  it('накрутка отзывов: копии текста, всплеск и серия одного автора → очередь и автоскрытие', async () => {
    const victim = uuidv7();
    const spammer = uuidv7();
    const authors = [uuidv7(), uuidv7(), uuidv7(), uuidv7(), spammer, spammer, spammer];
    const reviewIds = authors.map(() => uuidv7());
    await resources.bus.publish(
      authors.map((authorId, index) =>
        toRecord('reviews', { type: 'reviews.review.created.v1', key: victim, payload: { reviewId: reviewIds[index]!, masterId: victim, leadId: uuidv7(), authorId, rating: 5, textSimhash: 'a1b2c3d4e5f60718', createdAt: '' } }),
      ),
    );
    await resources.bus.drain();

    const { items } = await api.listModerationItems({ kind: 'review', status: 'open', page: undefined });
    expect(items.map((item) => item.subjectId)).toEqual([reviewIds[5]]);
    expect(items[0]!.reasons.map((r) => r.code).sort()).toEqual(['copy_text', 'velocity']);

    while ((await relay.tick()) > 0);
    const hidden = resources.bus.events('trust.moderation.decided.v1').filter((d) => d.kind === 'review');
    expect(hidden).toEqual([expect.objectContaining({ subjectId: reviewIds[6], decision: 'hide', moderatorId: 'auto', reasonCode: 'auto_fraud_score' })]);

    const decided = await api.decideModeration({ context: admin, itemId: items[0]!.id, decision: 'hide', reasonCode: 'review_fraud' });
    expect(decided.item!.status).toBe('decided');
  });

  it('жалобы: повтор того же пользователя не считается, жалобы разных людей поднимают риск', async () => {
    const subjectId = uuidv7();
    const report = (userId: string) => api.createReport({ context: { ...admin, role: 'client', userId }, subjectType: 'master', subjectId, reason: 'fake', note: 'Чужие фото работ' });
    const reporter = uuidv7();
    const first = await report(reporter);
    expect((await report(reporter)).id).toBe(first.id);
    await report(uuidv7());
    const { items } = await api.listModerationItems({ kind: 'master', status: 'open', page: undefined });
    const item = items.find((candidate) => candidate.subjectId === subjectId)!;
    expect(item.riskScore).toBeCloseTo(0.8);
    expect(item.reasons.map((r) => r.code)).toEqual(['report_fake', 'repeated_reports']);
    await expect(api.createReport({ context: admin, subjectType: 'planet', subjectId, reason: 'fake', note: '' })).rejects.toMatchObject({ reason: 'invalid_report' });

    const stats = await api.getModerationStats({});
    expect(stats.pending).toBeGreaterThanOrEqual(2);
    expect(stats.highRisk).toBeGreaterThanOrEqual(1);
  });

  it('одно фото у разных владельцев', async () => {
    const sha = 'f'.repeat(64);
    await resources.bus.publish([
      toRecord('media', { type: 'media.asset.uploaded.v1', key: 'x', payload: { assetId: uuidv7(), ownerId: uuidv7(), purpose: 'portfolio', sha256: sha, phash: '', contentType: 'image/jpeg', size: 10 } }),
      toRecord('media', { type: 'media.asset.uploaded.v1', key: 'y', payload: { assetId: uuidv7(), ownerId: uuidv7(), purpose: 'portfolio', sha256: sha, phash: '', contentType: 'image/jpeg', size: 10 } }),
    ]);
    await resources.bus.drain();
    expect((await api.listModerationItems({ kind: 'media', status: 'open', page: undefined })).items).toHaveLength(1);
  });
});
