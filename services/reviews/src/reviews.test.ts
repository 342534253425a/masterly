import { fileURLToPath } from 'node:url';
import { uuidv7 } from '@masterly/kernel';
import { createGrpcClient, loadMigrations, OutboxRelay, toRecord, type PromiseClient } from '@masterly/platform';
import { createTestResources, startTestMicroservice } from '@masterly/platform/testing';
import type { reviews } from '@masterly/proto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ReviewsModule } from './module.js';

const spec = { package: 'masterly.reviews.v1', protoPath: 'masterly/reviews/v1/reviews.proto' };
const clientId = uuidv7();
const masterId = uuidv7();
const context = { userId: clientId, role: 'client', requestId: '', locale: 'ru', ipHash: '', masterId: '', name: 'Алина' };
const masterContext = { ...context, userId: uuidv7(), role: 'master', masterId };

describe('reviews', async () => {
  const resources = await createTestResources('reviews', { migrations: await loadMigrations(fileURLToPath(new URL('../migrations', import.meta.url))) });
  const acks: string[] = [];
  let server: { address: string; close(): Promise<void> };
  let api: PromiseClient<reviews.ReviewsServiceClient> & { close(): void };
  const relay = new OutboxRelay(resources.db, resources.bus, resources.logger);

  /** Заявка проходит путь до «выполнено» — так в reviews появляется право на отзыв. */
  async function completedLead(): Promise<string> {
    const leadId = uuidv7();
    await resources.bus.publish([
      toRecord('leads', { type: 'leads.lead.created.v1', key: leadId, payload: { leadId, clientId, masterIds: [masterId], serviceId: 'display', modelId: 'iphone-13', cityId: 'msk', urgency: 'today', createdAt: new Date().toISOString() } }),
      toRecord('leads', { type: 'leads.lead.status_changed.v1', key: leadId, payload: { leadId, masterId, clientId, fromStatus: 'in_progress', toStatus: 'completed', actor: 'master', at: new Date().toISOString() } }),
    ]);
    await resources.bus.drain();
    return leadId;
  }

  beforeAll(async () => {
    server = await startTestMicroservice(ReviewsModule.register(resources, { erasureAck: async (userId) => void acks.push(userId) }), spec);
    api = createGrpcClient<reviews.ReviewsServiceClient>({ target: 'reviews', address: server.address, ...spec, service: 'ReviewsService', defaultDeadlineMs: 5_000 });
  });
  afterAll(async () => {
    api.close();
    await server.close();
    await resources.db.close();
  });

  it('без выполненной заявки отзыв невозможен', async () => {
    await expect(api.createReview({ context, leadId: uuidv7(), rating: 5, text: 'Отличный мастер, всё быстро', deviceFingerprint: '', authorName: 'Алина' })).rejects.toMatchObject({ reason: 'review_not_eligible' });
  });

  it('отзыв по выполненной заявке: один на заявку, рейтинг и события', async () => {
    const leadId = await completedLead();
    const { review } = await api.createReview({ context, leadId, rating: 4, text: 'Заменили экран за час, всё работает', deviceFingerprint: 'fp1', authorName: 'Алина С.' });
    expect(review).toMatchObject({ masterId, rating: 4, serviceId: 'display', modelId: 'iphone-13', verified: true, status: 'published' });
    await expect(api.createReview({ context, leadId, rating: 5, text: 'Второй отзыв на ту же заявку', deviceFingerprint: '', authorName: '' })).rejects.toMatchObject({ reason: 'review_exists' });

    const second = await completedLead();
    await api.createReview({ context, leadId: second, rating: 5, text: 'Снова обратилась — снова отлично', deviceFingerprint: 'fp1', authorName: 'Алина С.' });
    expect(await api.getRatingSummary({ masterId })).toEqual({ rating: 4.5, reviewsCount: 2, distribution: [0, 0, 0, 1, 1], unanswered: 2 });

    while ((await relay.tick()) > 0);
    expect(resources.bus.events('reviews.review.created.v1')[0]!.textSimhash).toMatch(/^[0-9a-f]{16}$/);
    expect(resources.bus.events('reviews.rating.aggregated.v1').at(-1)).toEqual({ masterId, rating: 4.5, reviewsCount: 2, distribution: [0, 0, 0, 1, 1] });
  });

  it('ответ мастера и лента отзывов', async () => {
    const { reviews: list } = await api.listReviews({ masterId, sort: 'new', withPhotos: false, page: { cursor: '', limit: 10 } });
    expect(list).toHaveLength(2);
    await expect(api.replyToReview({ context, reviewId: list[0]!.id, masterId, text: 'Спасибо!' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    const { review } = await api.replyToReview({ context: masterContext, reviewId: list[0]!.id, masterId, text: 'Спасибо, ждём снова!' });
    expect(review!.replyText).toBe('Спасибо, ждём снова!');
    const fives = await api.listReviews({ masterId, sort: 'new', rating: 5, withPhotos: false, page: undefined });
    expect(fives.reviews.map((r) => r.rating)).toEqual([5]);
  });

  it('модерация скрывает отзыв и пересчитывает рейтинг', async () => {
    const { reviews: list } = await api.listReviews({ masterId, sort: 'rating_high', withPhotos: false, page: undefined });
    await resources.bus.publish([toRecord('trust', { type: 'trust.moderation.decided.v1', key: list[0]!.id, payload: { itemId: 'case', kind: 'review', subjectId: list[0]!.id, decision: 'hide', reasonCode: 'review_fraud', moderatorId: 'auto', at: '' } })]);
    await resources.bus.drain();
    expect(await api.getRatingSummary({ masterId })).toEqual({ rating: 4, reviewsCount: 1, distribution: [0, 0, 0, 1, 0], unanswered: 1 });
    expect((await api.listAuthorReviews({ authorId: clientId })).reviews.map((r) => r.status).sort()).toEqual(['hidden', 'published']);
  });

  it('удаление аккаунта автора обезличивает отзывы', async () => {
    await resources.bus.publish([toRecord('identity', { type: 'identity.account.deletion_requested.v1', key: clientId, payload: { userId: clientId, requestedAt: '', retainUntil: '', roles: [] } })]);
    await resources.bus.drain();
    const { reviews: list } = await api.listReviews({ masterId, sort: 'new', withPhotos: false, page: undefined });
    expect(list.map((r) => r.authorName)).toEqual(['Пользователь удалён']);
    expect(acks).toEqual([clientId]);
  });
});
