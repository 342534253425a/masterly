import { Inject, Injectable } from '@nestjs/common';
import { geohashEncode, hammingDistance, normalizeText, simhash64, simhashBands, trigramSimilarity, uuidv7 } from '@masterly/kernel';
import { DB, enqueue, forbidden, invalid, notFound, type Db, type Queryable } from '@masterly/platform';
import type { common, events, platform } from '@masterly/proto';

const SOURCE = 'trust';
const REVIEW_REVIEW_AT = 0.7;
const REVIEW_AUTO_HIDE_AT = 0.9;
const DUPLICATE_CANDIDATE_AT = 0.6;
const DUPLICATE_REVIEW_AT = 0.8;
/** Базовый риск жалобы по причине: мошенничество и фейки разбираются первыми. */
const REPORT_RISK: Record<string, number> = { fraud: 0.8, fake: 0.7, offensive: 0.6, spam: 0.5, wrong_info: 0.4, other: 0.3 };
const REPORT_LABELS: Record<string, string> = { fraud: 'мошенничество', fake: 'фейк', offensive: 'оскорбления', spam: 'спам', wrong_info: 'неверные сведения', other: 'другое' };

interface Fingerprint { entity_id: string; simhash: string; owner: string; author_id: string | null; geohash: string; label: string; city_id: string }
interface Reason { code: string; label: string; weight: number }

const bandsOf = (hex: string) => simhashBands(BigInt(`0x${hex}`));
const distance = (a: string, b: string) => hammingDistance(BigInt(`0x${a}`), BigInt(`0x${b}`));

function requireAdmin(context: common.RequestContext | undefined): string {
  if (context?.role !== 'admin') throw forbidden('Только для модераторов');
  return context.userId;
}

@Injectable()
export class TrustService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Профиль мастера: телефон, похожее описание, похожее название рядом — сигналы дубликата. */
  async onMasterUpserted(tx: Queryable, master: events.MasterUpserted): Promise<void> {
    if (master.status !== 'published') {
      await tx.query("DELETE FROM fingerprints WHERE entity_type = 'master' AND entity_id = $1", [master.masterId]);
      return;
    }
    const simhash = simhash64(`${master.name} ${master.tagline}`).toString(16).padStart(16, '0');
    const geohash = geohashEncode({ lat: master.lat, lng: master.lng }, 7);
    const label = normalizeText(master.name);
    await this.upsertFingerprint(tx, 'master', master.masterId, simhash, master.phoneHash, null, geohash, label, master.cityId);

    const [b0, b1, b2, b3] = bandsOf(simhash);
    const { rows } = await tx.query<Fingerprint>(
      `SELECT * FROM fingerprints WHERE entity_type = 'master' AND entity_id <> $1
         AND ((owner <> '' AND owner = $2) OR band0 = $3 OR band1 = $4 OR band2 = $5 OR band3 = $6 OR geohash LIKE $7)
       LIMIT 200`,
      [master.masterId, master.phoneHash, b0, b1, b2, b3, `${geohash.slice(0, 6)}%`],
    );
    for (const other of rows) {
      const nameSimilarity = trigramSimilarity(label, other.label);
      const signals = [
        { code: 'same_phone', value: 1, matched: !!master.phoneHash && other.owner === master.phoneHash },
        { code: 'similar_text', value: 1 - distance(simhash, other.simhash) / 64, matched: distance(simhash, other.simhash) <= 6 },
        { code: 'similar_name', value: nameSimilarity, matched: nameSimilarity >= 0.6 },
        { code: 'nearby', value: 1, matched: other.geohash.slice(0, 6) === geohash.slice(0, 6) },
      ];
      const score = Math.min(1, (signals[0]!.matched ? 0.6 : 0) + (signals[1]!.matched ? 0.25 : 0) + (signals[2]!.matched ? 0.3 * nameSimilarity : 0) + (signals[3]!.matched ? 0.1 : 0));
      if (score < DUPLICATE_CANDIDATE_AT) continue;
      const [a, b] = [master.masterId, other.entity_id].sort() as [string, string];
      await tx.query(
        `INSERT INTO duplicate_candidates (id, master_a, master_b, city_id, score, signals) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (master_a, master_b) DO UPDATE SET score = EXCLUDED.score, signals = EXCLUDED.signals`,
        [uuidv7(), a, b, master.cityId, score, JSON.stringify(signals)],
      );
      if (score >= DUPLICATE_REVIEW_AT) {
        await this.openItem(tx, 'duplicate', b, `Возможный дубликат профиля «${master.name}»`, '', score, signals.filter((s) => s.matched).map((s) => ({ code: s.code, label: s.code, weight: s.value })));
      }
    }
  }

  /** Отзыв: всплеск отзывов у мастера, копии текстов от разных авторов, серия отзывов одного автора. */
  async onReviewCreated(tx: Queryable, review: events.ReviewCreated): Promise<void> {
    await this.upsertFingerprint(tx, 'review', review.reviewId, review.textSimhash, review.masterId, review.authorId || null, '', '', '');
    const reasons: Reason[] = [];
    const velocity = await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM fingerprints WHERE entity_type = 'review' AND owner = $1 AND created_at > now() - interval '24 hours'", [review.masterId]);
    if (velocity.rows[0]!.n > 5) reasons.push({ code: 'velocity', label: 'Всплеск отзывов за сутки', weight: 0.35 });

    const [b0, b1, b2, b3] = bandsOf(review.textSimhash);
    const similar = await tx.query<Fingerprint>(
      `SELECT * FROM fingerprints WHERE entity_type = 'review' AND entity_id <> $1 AND author_id IS DISTINCT FROM $2::uuid
         AND created_at > now() - interval '30 days' AND (band0 = $3 OR band1 = $4 OR band2 = $5 OR band3 = $6) LIMIT 100`,
      [review.reviewId, review.authorId || null, b0, b1, b2, b3],
    );
    if (similar.rows.some((other) => distance(other.simhash, review.textSimhash) <= 3)) reasons.push({ code: 'copy_text', label: 'Почти тот же текст у другого автора', weight: 0.45 });

    if (review.authorId) {
      const burst = await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM fingerprints WHERE entity_type = 'review' AND author_id = $1 AND created_at > now() - interval '1 hour'", [review.authorId]);
      if (burst.rows[0]!.n >= 3) reasons.push({ code: 'author_burst', label: 'Серия отзывов одного автора', weight: 0.3 });
    }

    const risk = Math.min(1, reasons.reduce((sum, reason) => sum + reason.weight, 0));
    if (risk < REVIEW_REVIEW_AT) return;
    const itemId = await this.openItem(tx, 'review', review.reviewId, `Подозрительный отзыв (${review.rating}★)`, '', risk, reasons);
    if (risk >= REVIEW_AUTO_HIDE_AT) await this.decide(tx, itemId, 'review', review.reviewId, 'hide', 'auto_fraud_score', 'auto');
  }

  /** Одно и то же фото у разных владельцев — признак чужого портфолио или дубликата. */
  async onMediaUploaded(tx: Queryable, asset: events.MediaUploaded): Promise<void> {
    await tx.query('INSERT INTO media_hashes (sha256, owner_id, asset_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [asset.sha256, asset.ownerId, asset.assetId]);
    const others = await tx.query('SELECT 1 FROM media_hashes WHERE sha256 = $1 AND owner_id <> $2 LIMIT 1', [asset.sha256, asset.ownerId]);
    if (others.rowCount > 0) await this.openItem(tx, 'media', asset.assetId, 'Фото уже загружал другой пользователь', '', 0.6, [{ code: 'reused_photo', label: 'Повторное фото', weight: 0.6 }]);
  }

  /**
   * Жалоба пользователя → элемент очереди модерации. Каждая следующая жалоба на тот же объект поднимает риск,
   * повторная жалоба того же пользователя за сутки не считается.
   */
  async report(request: platform.CreateReportRequest): Promise<string> {
    const reporter = request.context?.userId;
    if (!reporter) throw forbidden('Требуется вход');
    const kinds: Record<string, string> = { master: 'master', review: 'review', photo: 'media', message: 'message' };
    const base = REPORT_RISK[request.reason];
    const kind = kinds[request.subjectType];
    if (!kind || base === undefined || !request.subjectId) throw invalid('Некорректная жалоба', 'invalid_report');
    return this.db.transaction(async (tx) => {
      const recent = await tx.query(
        "SELECT id FROM complaints WHERE reporter_id = $1 AND subject_type = $2 AND subject_id = $3 AND created_at > now() - interval '1 day' LIMIT 1",
        [reporter, request.subjectType, request.subjectId],
      );
      if (recent.rows[0]) return (recent.rows[0] as { id: string }).id;
      const id = uuidv7();
      await tx.query('INSERT INTO complaints (id, reporter_id, subject_type, subject_id, reason, note) VALUES ($1, $2, $3, $4, $5, $6)', [
        id, reporter, request.subjectType, request.subjectId, request.reason, request.note.slice(0, 1000),
      ]);
      const total = (await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM complaints WHERE subject_type = $1 AND subject_id = $2', [request.subjectType, request.subjectId])).rows[0]!.n;
      const risk = Math.min(1, base + 0.1 * (total - 1));
      await this.openItem(tx, kind, request.subjectId, `Жалоба: ${REPORT_LABELS[request.reason]}`, request.note.slice(0, 500), risk, [
        { code: `report_${request.reason}`, label: REPORT_LABELS[request.reason]!, weight: base },
        ...(total > 1 ? [{ code: 'repeated_reports', label: `Жалоб: ${total}`, weight: 0.1 * (total - 1) }] : []),
      ]);
      return id;
    });
  }

  async moderationStats(): Promise<platform.GetModerationStatsResponse> {
    const { rows } = await this.db.query<{ pending: number; high_risk: number; sla_breached: number }>(
      `SELECT count(*)::int AS pending,
              count(*) FILTER (WHERE risk_score >= 0.8)::int AS high_risk,
              count(*) FILTER (WHERE created_at < now() - interval '24 hours')::int AS sla_breached
         FROM moderation_items WHERE status = 'open'`,
    );
    return { pending: rows[0]!.pending, highRisk: rows[0]!.high_risk, slaBreached: rows[0]!.sla_breached };
  }

  async eraseAuthor(tx: Queryable, userId: string): Promise<void> {
    await tx.query('DELETE FROM complaints WHERE reporter_id = $1', [userId]);
    await tx.query('UPDATE fingerprints SET author_id = NULL WHERE author_id = $1', [userId]);
    await tx.query('DELETE FROM media_hashes WHERE owner_id = $1', [userId]);
  }

  async listItems(request: platform.ListModerationItemsRequest): Promise<platform.ModerationItem[]> {
    const limit = Math.min(Math.max(request.page?.limit || 50, 1), 200);
    const { rows } = await this.db.query<ItemRow>(
      `SELECT * FROM moderation_items WHERE ($1::text = '' OR kind = $1::text) AND status = $2 ORDER BY risk_score DESC, created_at LIMIT ${limit}`,
      [request.kind, request.status || 'open'],
    );
    return rows.map(toItem);
  }

  async decideItem(request: platform.DecideModerationRequest): Promise<platform.ModerationItem> {
    const actor = requireAdmin(request.context);
    if (!['approve', 'hide', 'suspend', 'restore'].includes(request.decision)) throw invalid('Неизвестное решение', 'invalid_decision');
    return this.db.transaction(async (tx) => {
      const item = (await tx.query<ItemRow>("SELECT * FROM moderation_items WHERE id = $1 AND status = 'open' FOR UPDATE", [request.itemId])).rows[0];
      if (!item) throw notFound('Элемент очереди не найден или уже решён');
      await this.decide(tx, item.id, item.kind === 'duplicate' ? 'master' : item.kind, item.subject_id, request.decision, request.reasonCode || 'manual', actor);
      return toItem((await tx.query<ItemRow>('SELECT * FROM moderation_items WHERE id = $1', [item.id])).rows[0]!);
    });
  }

  async listDuplicates(cityId: string): Promise<platform.DuplicateCandidate[]> {
    const { rows } = await this.db.query<CandidateRow>("SELECT * FROM duplicate_candidates WHERE status = 'open' AND ($1::text = '' OR city_id = $1::text) ORDER BY score DESC LIMIT 200", [cityId]);
    return rows.map(toCandidate);
  }

  async resolveDuplicate(request: platform.ResolveDuplicateRequest): Promise<platform.DuplicateCandidate> {
    const actor = requireAdmin(request.context);
    if (!['merge', 'dismiss'].includes(request.action)) throw invalid('Действие: merge или dismiss', 'invalid_action');
    return this.db.transaction(async (tx) => {
      const candidate = (await tx.query<CandidateRow>("SELECT * FROM duplicate_candidates WHERE id = $1 AND status = 'open' FOR UPDATE", [request.candidateId])).rows[0];
      if (!candidate) throw notFound('Кандидат не найден или уже обработан');
      await tx.query('UPDATE duplicate_candidates SET status = $2 WHERE id = $1', [candidate.id, request.action === 'merge' ? 'merged' : 'dismissed']);
      if (request.action === 'merge') await this.decide(tx, null, 'duplicate', candidate.master_b, 'merge', 'duplicate_profile', actor);
      return toCandidate((await tx.query<CandidateRow>('SELECT * FROM duplicate_candidates WHERE id = $1', [candidate.id])).rows[0]!);
    });
  }

  /** Решение пишется в журнал и публикуется: применяет его владелец данных (catalog, reviews). */
  private async decide(tx: Queryable, itemId: string | null, kind: string, subjectId: string, decision: string, reasonCode: string, actor: string): Promise<void> {
    if (itemId) await tx.query("UPDATE moderation_items SET status = 'decided', decided_at = now() WHERE id = $1", [itemId]);
    const id = uuidv7();
    await tx.query('INSERT INTO decisions (id, item_id, kind, subject_id, decision, reason_code, actor) VALUES ($1, $2, $3, $4, $5, $6, $7)', [id, itemId, kind, subjectId, decision, reasonCode, actor]);
    await enqueue(tx, SOURCE, [{ type: 'trust.moderation.decided.v1', key: subjectId, payload: { itemId: itemId ?? id, kind, subjectId, decision, reasonCode, moderatorId: actor, at: new Date().toISOString() } }]);
  }

  private async openItem(tx: Queryable, kind: string, subjectId: string, title: string, content: string, risk: number, reasons: Reason[]): Promise<string> {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO moderation_items (id, kind, subject_id, title, content, risk_score, reasons) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (kind, subject_id) DO UPDATE SET risk_score = GREATEST(moderation_items.risk_score, EXCLUDED.risk_score), reasons = EXCLUDED.reasons
       RETURNING id`,
      [uuidv7(), kind, subjectId, title, content, risk, JSON.stringify(reasons)],
    );
    return rows[0]!.id;
  }

  private async upsertFingerprint(tx: Queryable, type: string, id: string, simhash: string, owner: string, authorId: string | null, geohash: string, label: string, cityId: string): Promise<void> {
    const [b0, b1, b2, b3] = bandsOf(simhash);
    await tx.query(
      `INSERT INTO fingerprints (entity_type, entity_id, simhash, band0, band1, band2, band3, owner, author_id, geohash, label, city_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (entity_type, entity_id) DO UPDATE SET simhash = EXCLUDED.simhash, band0 = EXCLUDED.band0, band1 = EXCLUDED.band1, band2 = EXCLUDED.band2,
         band3 = EXCLUDED.band3, owner = EXCLUDED.owner, geohash = EXCLUDED.geohash, label = EXCLUDED.label, city_id = EXCLUDED.city_id`,
      [type, id, simhash, b0, b1, b2, b3, owner, authorId, geohash, label, cityId],
    );
  }
}

interface ItemRow { id: string; kind: string; status: string; subject_id: string; title: string; content: string; risk_score: number; reasons: Reason[]; created_at: Date }
interface CandidateRow { id: string; master_a: string; master_b: string; score: number; signals: platform.DuplicateSignal[]; status: string }

function toItem(row: ItemRow): platform.ModerationItem {
  return { id: row.id, kind: row.kind, status: row.status, subjectId: row.subject_id, title: row.title, content: row.content, riskScore: Math.round(row.risk_score * 100) / 100, reasons: row.reasons, createdAt: new Date(row.created_at).toISOString() };
}

function toCandidate(row: CandidateRow): platform.DuplicateCandidate {
  return { id: row.id, masterAId: row.master_a, masterBId: row.master_b, score: Math.round(row.score * 100) / 100, signals: row.signals, status: row.status };
}
