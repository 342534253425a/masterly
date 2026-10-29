import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '@masterly/kernel';
import { AppError, conflict, DB, enqueue, forbidden, invalid, KV, notFound, unauthenticated, type Db, type KeyValueStore, type Queryable } from '@masterly/platform';
import { leads, type common } from '@masterly/proto';
import type { ContactsProvider, MasterMatcher } from './ports.js';
import { CONTACTS, MATCHER } from './tokens.js';

const SOURCE = 'leads';
const OPEN = ['new', 'viewed', 'responded'];
const CLOSED_RECIPIENT = ['declined', 'expired', 'accepted'];
const REVEALS_PER_DAY = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LeadRow {
  id: string; number: string; client_id: string; city_id: string; service_id: string; model_id: string; description: string; urgency: string;
  visit_type: string; preferred_channel: string; share_phone: boolean; status: string; accepted_master_id: string | null;
  created_at: Date; updated_at: Date; expires_at: Date;
}
interface RecipientRow { lead_id: string; master_id: string; status: string; viewed_at: Date | null }
interface ResponseRow { id: string; lead_id: string; master_id: string; price_from_minor: number; price_to_minor: number | null; message: string; eta_min: number; status: string; created_at: Date }
interface EventRow { lead_id: string; type: string; at: Date; actor: string; note: string }
interface Actor { id: string; role: string; masterId: string }

const PHONE = /(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
/** Телефоны и email в тексте заявки скрываются, если клиент не разрешил показывать контакты. */
export const maskContacts = (text: string) => text.replace(PHONE, '[контакт скрыт]').replace(EMAIL, '[контакт скрыт]');

const toStatus = (status: string) => `LEAD_STATUS_${status.toUpperCase()}` as leads.LeadStatus;
const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : '');

function actorOf(context: common.RequestContext | undefined): Actor {
  if (!context?.userId) throw unauthenticated();
  return { id: context.userId, role: context.role, masterId: context.masterId };
}

@Injectable()
export class LeadsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KV) private readonly kv: KeyValueStore,
    @Inject(MATCHER) private readonly matcher: MasterMatcher,
    @Inject(CONTACTS) private readonly contactsProvider: ContactsProvider,
  ) {}

  /** Создание заявки: идемпотентно по (клиент, ключ); получатели выбираются до транзакции; событие — через outbox. */
  async create(request: leads.CreateLeadRequest): Promise<leads.Lead> {
    const actor = actorOf(request.context);
    const description = request.description.trim();
    if (description.length < 10) throw invalid('Опишите проблему подробнее — хотя бы пару слов', 'description_too_short');
    if (description.length > 2000) throw invalid('Описание длиннее 2000 символов', 'description_too_long');
    if (!request.cityId || !request.serviceId) throw invalid('Укажите город и услугу', 'service_required');
    const key = request.idempotencyKey.trim();
    if (key) {
      const known = await this.db.query<{ lead_id: string }>('SELECT lead_id FROM lead_idempotency WHERE client_id = $1 AND key = $2', [actor.id, key]);
      if (known.rows[0]) return this.get(request.context, known.rows[0].lead_id);
    }

    const direct = [...new Set(request.masterIds.filter((id) => UUID.test(id)))].slice(0, 10);
    const recipients = direct.length > 0 ? direct : request.broadcast ? await this.matcher.match({ cityId: request.cityId, serviceId: request.serviceId, modelId: request.modelId, limit: 5 }) : [];
    if (recipients.length === 0) throw conflict('Не нашлось мастеров для заявки — измените условия или выберите мастера', 'no_recipients');

    const id = uuidv7();
    const expiresAt = new Date(Date.now() + (request.urgency === 'asap' ? 24 : 72) * 3_600_000);
    const claimed = await this.db.transaction(async (tx) => {
      if (key) {
        const inserted = await tx.query('INSERT INTO lead_idempotency (client_id, key, lead_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [actor.id, key, id]);
        if (inserted.rowCount === 0) return false;
      }
      const { n } = (await tx.query<{ n: number }>("SELECT nextval('lead_number_seq')::int AS n")).rows[0]!;
      await tx.query(
        `INSERT INTO leads (id, number, client_id, city_id, service_id, model_id, description, urgency, visit_type, preferred_channel, share_phone, photo_ids, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::uuid[], $13)`,
        [id, `M-${String(n).padStart(6, '0')}`, actor.id, request.cityId, request.serviceId, request.modelId, request.sharePhone ? description : maskContacts(description), request.urgency, request.visitType, request.preferredChannel, request.sharePhone, request.photoIds.filter((photo) => UUID.test(photo)), expiresAt],
      );
      for (const masterId of recipients) await tx.query('INSERT INTO lead_recipients (lead_id, master_id) VALUES ($1, $2)', [id, masterId]);
      await this.event(tx, id, 'created', 'client');
      await enqueue(tx, SOURCE, [
        { type: 'leads.lead.created.v1', key: id, payload: { leadId: id, clientId: actor.id, masterIds: recipients, serviceId: request.serviceId, modelId: request.modelId, cityId: request.cityId, urgency: request.urgency, createdAt: new Date().toISOString() } },
      ]);
      return true;
    });
    if (!claimed) {
      // Параллельный повтор с тем же ключом успел первым: возвращаем его заявку
      const known = await this.db.query<{ lead_id: string }>('SELECT lead_id FROM lead_idempotency WHERE client_id = $1 AND key = $2', [actor.id, key]);
      return this.get(request.context, known.rows[0]!.lead_id);
    }
    return this.get(request.context, id);
  }

  /** Клиент видит всё; мастер-получатель — только своё участие (без цен конкурентов); первый просмотр фиксируется. */
  async get(context: common.RequestContext | undefined, leadId: string): Promise<leads.Lead> {
    const actor = actorOf(context);
    let lead = await this.findLead(leadId);
    if (!lead) throw notFound('Заявка не найдена');
    const recipients = await this.recipientsOf([leadId]);
    const isClient = lead.client_id === actor.id;
    const asMaster = !!actor.masterId && recipients.some((recipient) => recipient.master_id === actor.masterId);
    if (!isClient && !asMaster && actor.role !== 'admin') throw notFound('Заявка не найдена');
    if (asMaster && !isClient && (await this.markViewed(lead, actor.masterId))) lead = (await this.findLead(leadId))!;
    const [responses, events] = await Promise.all([this.responsesOf([leadId]), this.db.query<EventRow>('SELECT * FROM lead_events WHERE lead_id = $1 ORDER BY at', [leadId])]);
    const own = (masterId: string) => isClient || actor.role === 'admin' || masterId === actor.masterId;
    return this.toProto(lead, (await this.recipientsOf([leadId])).filter((r) => own(r.master_id)), responses.filter((r) => own(r.master_id)), events.rows);
  }

  async listClient(context: common.RequestContext | undefined, page: common.PageRequest | undefined): Promise<leads.ListClientLeadsResponse> {
    const actor = actorOf(context);
    const limit = Math.min(Math.max(page?.limit || 20, 1), 50);
    const { rows } = page?.cursor
      ? await this.db.query<LeadRow>('SELECT * FROM leads WHERE client_id = $1 AND id < $2::uuid ORDER BY id DESC LIMIT $3', [actor.id, page.cursor, limit])
      : await this.db.query<LeadRow>('SELECT * FROM leads WHERE client_id = $1 ORDER BY id DESC LIMIT $2', [actor.id, limit]);
    return this.page(rows, limit, () => true);
  }

  async listMaster(request: leads.ListMasterLeadsRequest): Promise<leads.ListMasterLeadsResponse> {
    const actor = actorOf(request.context);
    const masterId = request.masterId || actor.masterId;
    if (!masterId || (masterId !== actor.masterId && actor.role !== 'admin')) throw forbidden();
    const limit = Math.min(Math.max(request.page?.limit || 20, 1), 50);
    const statuses = request.statuses.map((status) => status.replace('LEAD_STATUS_', '').toLowerCase());
    const params: unknown[] = [masterId, limit];
    let where = 'r.master_id = $1';
    if (statuses.length > 0) where += ` AND r.status = ANY($${params.push(statuses)}::text[])`;
    if (request.page?.cursor) where += ` AND r.lead_id < $${params.push(request.page.cursor)}::uuid`;
    const { rows } = await this.db.query<LeadRow>(`SELECT l.* FROM lead_recipients r JOIN leads l ON l.id = r.lead_id WHERE ${where} ORDER BY r.lead_id DESC LIMIT $2`, params);
    return this.page(rows, limit, (id) => id === masterId);
  }

  async respond(request: leads.RespondToLeadRequest): Promise<leads.Lead> {
    const actor = actorOf(request.context);
    const masterId = request.masterId || actor.masterId;
    if (!masterId || (masterId !== actor.masterId && actor.role !== 'admin')) throw forbidden();
    const price = request.price ?? { fromMinor: 0, toMinor: undefined };
    if (price.fromMinor < 0 || (price.toMinor !== undefined && price.toMinor < price.fromMinor)) throw invalid('Некорректная цена', 'invalid_price');
    await this.db.transaction(async (tx) => {
      const lead = await this.lockLead(tx, request.leadId);
      const recipient = (await tx.query<RecipientRow>('SELECT * FROM lead_recipients WHERE lead_id = $1 AND master_id = $2 FOR UPDATE', [lead.id, masterId])).rows[0];
      if (!recipient) throw notFound('Заявка не найдена');
      if (!OPEN.includes(lead.status)) throw conflict('Заявка уже закрыта', 'lead_closed');
      if (recipient.status === 'responded' || CLOSED_RECIPIENT.includes(recipient.status)) throw conflict('Вы уже ответили на эту заявку', 'already_responded');
      const responseId = uuidv7();
      await tx.query('INSERT INTO lead_responses (id, lead_id, master_id, price_from_minor, price_to_minor, message, eta_min) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
        responseId, lead.id, masterId, price.fromMinor, price.toMinor ?? null, request.message.trim().slice(0, 1000), Math.max(0, request.etaMin),
      ]);
      await tx.query("UPDATE lead_recipients SET status = 'responded', responded_at = now() WHERE lead_id = $1 AND master_id = $2", [lead.id, masterId]);
      await tx.query("UPDATE leads SET status = 'responded', version = version + 1, updated_at = now() WHERE id = $1", [lead.id]);
      await this.event(tx, lead.id, 'responded', 'master');
      await enqueue(tx, SOURCE, [{ type: 'leads.lead.responded.v1', key: lead.id, payload: { leadId: lead.id, masterId, responseId, priceFromMinor: price.fromMinor, etaMin: request.etaMin, clientId: lead.client_id } }]);
    });
    return this.get(request.context, request.leadId);
  }

  /** Клиент выбирает мастера: остальные получатели закрываются, контакты открываются по политике мастера. */
  async accept(request: leads.AcceptResponseRequest): Promise<leads.Lead> {
    const actor = actorOf(request.context);
    await this.db.transaction(async (tx) => {
      const lead = await this.lockLead(tx, request.leadId);
      if (lead.client_id !== actor.id) throw notFound('Заявка не найдена');
      if (!OPEN.includes(lead.status)) throw conflict('Заявка уже закрыта', 'lead_closed');
      const response = (await tx.query<ResponseRow>("SELECT * FROM lead_responses WHERE id = $1 AND lead_id = $2 AND status = 'active'", [request.responseId, lead.id])).rows[0];
      if (!response) throw notFound('Ответ мастера не найден');
      await tx.query("UPDATE leads SET status = 'accepted', accepted_master_id = $2, version = version + 1, updated_at = now() WHERE id = $1", [lead.id, response.master_id]);
      await tx.query("UPDATE lead_responses SET status = CASE WHEN id = $2 THEN 'accepted' ELSE 'rejected' END WHERE lead_id = $1", [lead.id, response.id]);
      await tx.query("UPDATE lead_recipients SET status = CASE WHEN master_id = $2 THEN 'accepted' ELSE 'expired' END WHERE lead_id = $1 AND status NOT IN ('declined')", [lead.id, response.master_id]);
      await this.event(tx, lead.id, 'accepted', 'client');
      await this.statusChanged(tx, lead, 'accepted', response.master_id, 'client');
    });
    return this.get(request.context, request.leadId);
  }

  async decline(request: leads.DeclineLeadRequest): Promise<leads.Lead> {
    const actor = actorOf(request.context);
    const masterId = request.masterId || actor.masterId;
    if (!masterId || (masterId !== actor.masterId && actor.role !== 'admin')) throw forbidden();
    await this.db.transaction(async (tx) => {
      const lead = await this.lockLead(tx, request.leadId);
      const updated = await tx.query("UPDATE lead_recipients SET status = 'declined' WHERE lead_id = $1 AND master_id = $2 AND status IN ('new', 'viewed', 'responded')", [lead.id, masterId]);
      if (updated.rowCount === 0) throw conflict('Заявку уже нельзя отклонить', 'recipient_closed');
      await this.event(tx, lead.id, 'declined', 'master', request.reason.slice(0, 200));
      const active = await tx.query("SELECT 1 FROM lead_recipients WHERE lead_id = $1 AND status IN ('new', 'viewed', 'responded')", [lead.id]);
      if (active.rowCount === 0 && OPEN.includes(lead.status)) await this.statusChanged(tx, lead, 'declined', masterId, 'master');
    });
    return this.get(request.context, request.leadId);
  }

  /** Работа по заявке: принята → в работе → выполнена (мастер или клиент подтверждает выполнение). */
  async changeStatus(request: leads.ChangeLeadStatusRequest): Promise<leads.Lead> {
    const actor = actorOf(request.context);
    const target = request.status.replace('LEAD_STATUS_', '').toLowerCase();
    await this.db.transaction(async (tx) => {
      const lead = await this.lockLead(tx, request.leadId);
      const isMaster = !!actor.masterId && lead.accepted_master_id === actor.masterId;
      const isClient = lead.client_id === actor.id;
      if (!isMaster && !isClient) throw notFound('Заявка не найдена');
      const allowed =
        (lead.status === 'accepted' && target === 'in_progress' && isMaster) ||
        (['accepted', 'in_progress'].includes(lead.status) && target === 'completed' && (isMaster || isClient));
      if (!allowed) throw conflict(`Нельзя перевести заявку из «${lead.status}» в «${target}»`, 'invalid_transition');
      await this.event(tx, lead.id, target, isMaster ? 'master' : 'client');
      await this.statusChanged(tx, lead, target, lead.accepted_master_id ?? '', isMaster ? 'master' : 'client');
    });
    return this.get(request.context, request.leadId);
  }

  async cancel(request: leads.CancelLeadRequest): Promise<leads.Lead> {
    const actor = actorOf(request.context);
    await this.db.transaction(async (tx) => {
      const lead = await this.lockLead(tx, request.leadId);
      if (lead.client_id !== actor.id) throw notFound('Заявка не найдена');
      if (![...OPEN, 'accepted', 'in_progress'].includes(lead.status)) throw conflict('Заявка уже закрыта', 'lead_closed');
      await tx.query("UPDATE lead_recipients SET status = 'expired' WHERE lead_id = $1 AND status IN ('new', 'viewed', 'responded', 'accepted')", [lead.id]);
      await this.event(tx, lead.id, 'cancelled', 'client');
      await this.statusChanged(tx, lead, 'cancelled', lead.accepted_master_id ?? '', 'client');
    });
    return this.get(request.context, request.leadId);
  }

  /** Раскрытие контактов: политика мастера, лимит на пользователя, журнал и событие для статистики. */
  async revealContacts(request: leads.RevealContactsRequest): Promise<leads.RevealContactsResponse> {
    const actor = actorOf(request.context);
    const day = new Date().toISOString().slice(0, 10);
    if ((await this.kv.incr(`reveal:${actor.id}:${day}`, 86_400_000)) > REVEALS_PER_DAY) throw new AppError('RESOURCE_EXHAUSTED', 'Слишком много просмотров контактов за сутки', 'reveal_limit');
    const contacts = await this.contactsProvider.contacts(request.masterId);
    if (contacts.policy === 'chat_only') throw conflict('Мастер принимает обращения только в чате', 'contacts_chat_only');
    if (contacts.policy === 'after_lead') {
      const related = await this.db.query('SELECT 1 FROM lead_recipients r JOIN leads l ON l.id = r.lead_id WHERE r.master_id = $1 AND l.client_id = $2 LIMIT 1', [request.masterId, actor.id]);
      if (related.rowCount === 0) throw conflict('Контакты мастер показывает после заявки', 'contacts_after_lead');
    }
    const revealId = uuidv7();
    await this.db.transaction(async (tx) => {
      await tx.query('INSERT INTO contact_reveals (id, user_id, master_id) VALUES ($1, $2, $3)', [revealId, actor.id, request.masterId]);
      await enqueue(tx, SOURCE, [{ type: 'leads.contact.revealed.v1', key: request.masterId, payload: { masterId: request.masterId, userId: actor.id, at: new Date().toISOString() } }]);
    });
    return { revealId, phone: contacts.phone, telegram: contacts.telegram, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
  }

  /** Фоновое истечение открытых заявок (лидер — тот, кто взял advisory-лок). */
  async expireDue(): Promise<number> {
    return this.db.transaction(async (tx) => {
      const lock = await tx.query<{ locked: boolean }>('SELECT pg_try_advisory_xact_lock(7340034) AS locked');
      if (!lock.rows[0]?.locked) return 0;
      const due = await tx.query<LeadRow>("SELECT * FROM leads WHERE status IN ('new', 'viewed', 'responded') AND expires_at < now() ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED");
      for (const lead of due.rows) {
        await tx.query("UPDATE lead_recipients SET status = 'expired' WHERE lead_id = $1 AND status IN ('new', 'viewed', 'responded')", [lead.id]);
        await this.event(tx, lead.id, 'expired', 'system');
        await this.statusChanged(tx, lead, 'expired', '', 'system');
      }
      return due.rows.length;
    });
  }

  /** Количество заявок клиентов (админка: список пользователей). */
  async countClients(clientIds: string[]): Promise<Record<string, number>> {
    const ids = clientIds.filter((id) => UUID.test(id)).slice(0, 200);
    if (ids.length === 0) return {};
    const { rows } = await this.db.query<{ client_id: string; n: number }>('SELECT client_id, count(*)::int AS n FROM leads WHERE client_id = ANY($1::uuid[]) GROUP BY client_id', [ids]);
    return Object.fromEntries(rows.map((row) => [row.client_id, row.n]));
  }

  /** Удаление аккаунта клиента: текст и фото заявок обезличиваются, журнал раскрытий удаляется. */
  async eraseClient(tx: Queryable, userId: string): Promise<void> {
    await tx.query("UPDATE leads SET description = '[удалено по запросу пользователя]', photo_ids = '{}', share_phone = false WHERE client_id = $1", [userId]);
    await tx.query('DELETE FROM contact_reveals WHERE user_id = $1', [userId]);
  }

  private async statusChanged(tx: Queryable, lead: LeadRow, to: string, masterId: string, actor: string): Promise<void> {
    await tx.query('UPDATE leads SET status = $2, version = version + 1, updated_at = now() WHERE id = $1', [lead.id, to]);
    await enqueue(tx, SOURCE, [
      { type: 'leads.lead.status_changed.v1', key: lead.id, payload: { leadId: lead.id, masterId, clientId: lead.client_id, fromStatus: lead.status, toStatus: to, actor, at: new Date().toISOString() } },
    ]);
  }

  private async markViewed(lead: LeadRow, masterId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const viewed = await tx.query("UPDATE lead_recipients SET status = 'viewed', viewed_at = now() WHERE lead_id = $1 AND master_id = $2 AND status = 'new'", [lead.id, masterId]);
      if (viewed.rowCount === 0) return false;
      await this.event(tx, lead.id, 'viewed', 'master');
      if (lead.status === 'new') await this.statusChanged(tx, lead, 'viewed', masterId, 'master');
      return true;
    });
  }

  private async lockLead(tx: Queryable, leadId: string): Promise<LeadRow> {
    if (!UUID.test(leadId)) throw notFound('Заявка не найдена');
    const lead = (await tx.query<LeadRow>('SELECT * FROM leads WHERE id = $1 FOR UPDATE', [leadId])).rows[0];
    if (!lead) throw notFound('Заявка не найдена');
    return lead;
  }

  private async findLead(leadId: string): Promise<LeadRow | undefined> {
    if (!UUID.test(leadId)) return undefined;
    return (await this.db.query<LeadRow>('SELECT * FROM leads WHERE id = $1', [leadId])).rows[0];
  }

  private async event(tx: Queryable, leadId: string, type: string, actor: string, note = ''): Promise<void> {
    await tx.query('INSERT INTO lead_events (lead_id, type, actor, note) VALUES ($1, $2, $3, $4)', [leadId, type, actor, note]);
  }

  private async recipientsOf(ids: string[]): Promise<RecipientRow[]> {
    return (await this.db.query<RecipientRow>('SELECT * FROM lead_recipients WHERE lead_id = ANY($1::uuid[]) ORDER BY master_id', [ids])).rows;
  }

  private async responsesOf(ids: string[]): Promise<ResponseRow[]> {
    return (await this.db.query<ResponseRow>('SELECT * FROM lead_responses WHERE lead_id = ANY($1::uuid[]) ORDER BY created_at', [ids])).rows;
  }

  private async page(rows: LeadRow[], limit: number, visible: (masterId: string) => boolean) {
    const ids = rows.map((row) => row.id);
    const [recipients, responses] = await Promise.all([this.recipientsOf(ids), this.responsesOf(ids)]);
    return {
      leads: rows.map((row) => this.toProto(row, recipients.filter((r) => r.lead_id === row.id && visible(r.master_id)), responses.filter((r) => r.lead_id === row.id && visible(r.master_id)), [])),
      page: { nextCursor: rows.length === limit ? rows.at(-1)!.id : '', total: 0 },
    };
  }

  private toProto(lead: LeadRow, recipients: RecipientRow[], responses: ResponseRow[], events: EventRow[]): leads.Lead {
    return {
      id: lead.id, number: lead.number, clientId: lead.client_id, cityId: lead.city_id, serviceId: lead.service_id, modelId: lead.model_id,
      description: lead.description, urgency: lead.urgency, visitType: lead.visit_type, preferredChannel: lead.preferred_channel, sharePhone: lead.share_phone,
      status: toStatus(lead.status), createdAt: iso(lead.created_at), updatedAt: iso(lead.updated_at), expiresAt: iso(lead.expires_at),
      recipients: recipients.map((r) => ({ masterId: r.master_id, status: toStatus(r.status), viewedAt: iso(r.viewed_at) })),
      responses: responses.map((r) => ({ id: r.id, masterId: r.master_id, price: { fromMinor: r.price_from_minor, toMinor: r.price_to_minor ?? undefined }, message: r.message, etaMin: r.eta_min, createdAt: iso(r.created_at), status: r.status })),
      timeline: events.map((e) => ({ type: e.type, at: iso(e.at), actor: e.actor, note: e.note })),
      acceptedMasterId: lead.accepted_master_id ?? '', conversationId: '', reviewId: '',
    };
  }
}
