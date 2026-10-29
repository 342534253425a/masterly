import { Inject, Injectable } from '@nestjs/common';
import { simhash64, uuidv7 } from '@masterly/kernel';
import { conflict, DB, enqueue, forbidden, invalid, notFound, unauthenticated, type Db, type Queryable } from '@masterly/platform';
import type { common, events, reviews } from '@masterly/proto';

const SOURCE = 'reviews';
const REVIEW_WINDOW_DAYS = 90;

interface ReviewRow {
  id: string; lead_id: string; master_id: string; author_name: string; rating: number; text: string; service_id: string; model_id: string;
  photos: number; helpful: number; status: string; fraud_score: number; created_at: Date; reply_text: string | null; reply_at: Date | null;
}

const SELECT_REVIEW = 'SELECT r.*, p.text AS reply_text, p.created_at AS reply_at FROM reviews r LEFT JOIN review_replies p ON p.review_id = r.id';

@Injectable()
export class ReviewsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(request: reviews.CreateReviewRequest): Promise<reviews.Review> {
    const userId = request.context?.userId;
    if (!userId) throw unauthenticated();
    if (!Number.isInteger(request.rating) || request.rating < 1 || request.rating > 5) throw invalid('Оценка — от 1 до 5', 'invalid_rating');
    const text = request.text.trim();
    if (text.length < 10 || text.length > 3000) throw invalid('Отзыв — от 10 до 3000 символов', 'invalid_text');

    const id = uuidv7();
    await this.db.transaction(async (tx) => {
      const eligibility = (await tx.query<{ master_id: string; client_id: string; service_id: string; model_id: string; expires_at: Date }>('SELECT * FROM review_eligibility WHERE lead_id = $1', [request.leadId])).rows[0];
      if (!eligibility || eligibility.client_id !== userId) throw conflict('Отзыв можно оставить только по выполненной заявке', 'review_not_eligible');
      if (new Date(eligibility.expires_at).getTime() < Date.now()) throw conflict('Срок для отзыва по этой заявке истёк', 'review_window_closed');
      const inserted = await tx.query(
        `INSERT INTO reviews (id, lead_id, master_id, author_id, author_name, rating, text, service_id, model_id, device_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (lead_id) DO NOTHING`,
        [id, request.leadId, eligibility.master_id, userId, request.authorName.trim() || 'Клиент', request.rating, text, eligibility.service_id, eligibility.model_id, request.deviceFingerprint || null],
      );
      if (inserted.rowCount === 0) throw conflict('Отзыв по этой заявке уже оставлен', 'review_exists');
      await enqueue(tx, SOURCE, [
        {
          type: 'reviews.review.created.v1',
          key: eligibility.master_id,
          payload: { reviewId: id, masterId: eligibility.master_id, leadId: request.leadId, authorId: userId, rating: request.rating, textSimhash: simhash64(text).toString(16).padStart(16, '0'), createdAt: new Date().toISOString() },
        },
      ]);
      await this.recompute(tx, eligibility.master_id);
    });
    return (await this.byIds([id]))[0]!;
  }

  async list(request: reviews.ListReviewsRequest): Promise<reviews.ListReviewsResponse> {
    const limit = Math.min(Math.max(request.page?.limit || 10, 1), 50);
    const offset = Number(request.page?.cursor || 0) || 0;
    const params: unknown[] = [request.masterId];
    let where = "r.master_id = $1 AND r.status = 'published'";
    if (request.rating !== undefined && request.rating > 0) where += ` AND r.rating = $${params.push(request.rating)}`;
    if (request.withPhotos) where += ' AND r.photos > 0';
    const order = { helpful: 'r.helpful DESC, r.id DESC', rating_high: 'r.rating DESC, r.id DESC', rating_low: 'r.rating ASC, r.id DESC' }[request.sort] ?? 'r.id DESC';
    const { rows } = await this.db.query<ReviewRow>(`${SELECT_REVIEW} WHERE ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params);
    const summary = await this.summary(request.masterId);
    return { reviews: rows.map(toReview), page: { nextCursor: rows.length === limit ? String(offset + limit) : '', total: summary.reviewsCount }, distribution: summary.distribution, rating: summary.rating };
  }

  async reply(request: reviews.ReplyToReviewRequest): Promise<reviews.Review> {
    const context: common.RequestContext | undefined = request.context;
    const masterId = request.masterId || context?.masterId;
    if (!masterId || (masterId !== context?.masterId && context?.role !== 'admin')) throw forbidden();
    const text = request.text.trim();
    if (text.length < 2 || text.length > 2000) throw invalid('Ответ — от 2 до 2000 символов', 'invalid_text');
    const review = (await this.byIds([request.reviewId]))[0];
    if (!review || review.masterId !== masterId) throw notFound('Отзыв не найден');
    await this.db.query('INSERT INTO review_replies (review_id, master_id, text) VALUES ($1, $2, $3) ON CONFLICT (review_id) DO UPDATE SET text = EXCLUDED.text, created_at = now()', [request.reviewId, masterId, text]);
    return (await this.byIds([request.reviewId]))[0]!;
  }

  async summary(masterId: string): Promise<reviews.GetRatingSummaryResponse> {
    const row = (await this.db.query<{ rating: number; count: number; distribution: number[] }>('SELECT rating, count, distribution FROM ratings WHERE master_id = $1', [masterId])).rows[0];
    const unanswered = await this.db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM reviews r LEFT JOIN review_replies p ON p.review_id = r.id WHERE r.master_id = $1 AND r.status = 'published' AND p.review_id IS NULL",
      [masterId],
    );
    return { rating: row?.rating ?? 0, reviewsCount: row?.count ?? 0, distribution: row?.distribution ?? [0, 0, 0, 0, 0], unanswered: unanswered.rows[0]!.n };
  }

  /** Экспорт персональных данных: все отзывы автора, включая скрытые модерацией. */
  async byAuthor(authorId: string): Promise<reviews.Review[]> {
    const { rows } = await this.db.query<ReviewRow>(`${SELECT_REVIEW} WHERE r.author_id = $1 ORDER BY r.id DESC`, [authorId]);
    return rows.map(toReview);
  }

  /** Факты из leads.lead.v1: метаданные заявки и право на отзыв после выполнения. */
  async onLeadCreated(tx: Queryable, event: events.LeadCreated): Promise<void> {
    await tx.query('INSERT INTO lead_meta (lead_id, client_id, service_id, model_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [event.leadId, event.clientId, event.serviceId, event.modelId]);
  }

  async onLeadStatusChanged(tx: Queryable, event: events.LeadStatusChanged): Promise<void> {
    if (event.toStatus !== 'completed' || !event.masterId) return;
    const meta = (await tx.query<{ service_id: string; model_id: string }>('SELECT service_id, model_id FROM lead_meta WHERE lead_id = $1', [event.leadId])).rows[0];
    await tx.query(
      `INSERT INTO review_eligibility (lead_id, master_id, client_id, service_id, model_id, completed_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6::timestamptz + make_interval(days => $7)) ON CONFLICT DO NOTHING`,
      [event.leadId, event.masterId, event.clientId, meta?.service_id ?? '', meta?.model_id ?? '', event.at || new Date().toISOString(), REVIEW_WINDOW_DAYS],
    );
  }

  /** Решение модерации по отзыву: скрыть или вернуть, рейтинг пересчитывается. */
  async onModeration(tx: Queryable, decision: events.ModerationDecided): Promise<void> {
    if (decision.kind !== 'review') return;
    const status = { hide: 'hidden', approve: 'published', restore: 'published' }[decision.decision];
    if (!status) return;
    const updated = await tx.query<{ master_id: string }>('UPDATE reviews SET status = $2 WHERE id = $1 AND status <> $2 RETURNING master_id', [decision.subjectId, status]);
    if (updated.rows[0]) await this.recompute(tx, updated.rows[0].master_id);
  }

  async eraseAuthor(tx: Queryable, userId: string): Promise<void> {
    await tx.query("UPDATE reviews SET author_id = NULL, author_name = 'Пользователь удалён', device_hash = NULL WHERE author_id = $1", [userId]);
    await tx.query('DELETE FROM lead_meta WHERE client_id = $1', [userId]);
  }

  /** Средняя, количество и распределение по опубликованным отзывам → компактированный reviews.rating.v1. */
  private async recompute(tx: Queryable, masterId: string): Promise<void> {
    const { rows } = await tx.query<{ rating: number; count: number }>("SELECT rating, count(*)::int AS count FROM reviews WHERE master_id = $1 AND status = 'published' GROUP BY rating", [masterId]);
    const distribution = [1, 2, 3, 4, 5].map((stars) => rows.find((row) => Number(row.rating) === stars)?.count ?? 0);
    const count = distribution.reduce((sum, value) => sum + value, 0);
    const rating = count ? Math.round((distribution.reduce((sum, value, index) => sum + value * (index + 1), 0) / count) * 100) / 100 : 0;
    await tx.query(
      `INSERT INTO ratings (master_id, count, rating, distribution) VALUES ($1, $2, $3, $4::integer[])
       ON CONFLICT (master_id) DO UPDATE SET count = EXCLUDED.count, rating = EXCLUDED.rating, distribution = EXCLUDED.distribution, updated_at = now()`,
      [masterId, count, rating, distribution],
    );
    await enqueue(tx, SOURCE, [{ type: 'reviews.rating.aggregated.v1', key: masterId, payload: { masterId, rating, reviewsCount: count, distribution } }]);
  }

  private async byIds(ids: string[]): Promise<reviews.Review[]> {
    const { rows } = await this.db.query<ReviewRow>(`${SELECT_REVIEW} WHERE r.id = ANY($1::uuid[])`, [ids]);
    return rows.map(toReview);
  }
}

function toReview(row: ReviewRow): reviews.Review {
  return {
    id: row.id, masterId: row.master_id, authorName: row.author_name, rating: Number(row.rating), text: row.text, serviceId: row.service_id, modelId: row.model_id,
    createdAt: new Date(row.created_at).toISOString(), verified: true, photos: row.photos, helpful: row.helpful, replyText: row.reply_text ?? '',
    replyAt: row.reply_at ? new Date(row.reply_at).toISOString() : '', status: row.status, fraudScore: row.fraud_score,
  };
}
