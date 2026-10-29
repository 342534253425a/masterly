import { Inject, Injectable } from '@nestjs/common';
import { normalizeRuPhone, uuidv7 } from '@masterly/kernel';
import { AppError, DB, enqueue, enqueueTombstone, conflict, invalid, jsonCodec, KV, notFound, ReadThroughCache, type Db, type FieldCipher, type KeyValueStore, type Queryable } from '@masterly/platform';
import type { catalog, events } from '@masterly/proto';
import { CatalogRepository, type MasterPatch, type MasterRow, type OfferRow } from './repository.js';
import { completenessOf, effectivePlan, toMaster, toUpserted } from './snapshot.js';
import { CIPHER } from './tokens.js';

const SOURCE = 'catalog';
const cardKey = (id: string) => `card:${id}`;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Прайс платных функций (копейки). Оплата — только по счёту, который выставляет бухгалтерия (ADR-0009).
 * Совпадает с витриной кабинета (ru.json → cabinet.billing.products): счёт не расходится с тем, что видел мастер.
 */
const PRICES: Record<string, number> = { pro_month: 249_000, pro_year: 2_390_000, promotion_week: 129_000 };

interface InvoiceRow {
  id: string;
  number: string;
  master_id: string;
  product: string;
  amount_minor: number;
  payer: string;
  status: string;
  issued_at: Date;
  paid_at: Date | null;
}

const toInvoice = (row: InvoiceRow): catalog.Invoice => ({
  id: row.id,
  number: row.number,
  product: row.product,
  amountMinor: row.amount_minor,
  status: row.status,
  issuedAt: new Date(row.issued_at).toISOString(),
  payer: row.payer,
  paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : '',
});

/** Цены по сегментам устройств 1…5, если мастер задал только «от» и «до». */
export function interpolateTiers(from: number, to: number): number[] {
  return [0, 1, 2, 3, 4].map((step) => Math.round(from + ((to - from) * step) / 4));
}

@Injectable()
export class CatalogService {
  private readonly cards: ReadThroughCache<catalog.Master>;
  private reference?: { at: number; services: catalog.Service[]; models: catalog.DeviceModel[] };

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KV) kv: KeyValueStore,
    @Inject(CIPHER) private readonly cipher: FieldCipher,
    private readonly repo: CatalogRepository,
  ) {
    this.cards = new ReadThroughCache(kv, { name: 'master_card', ttlMs: 10 * 60_000, negativeTtlMs: 30_000, codec: jsonCodec<catalog.Master>() });
  }

  async getMaster(key: { id?: string; slug?: string }): Promise<catalog.Master> {
    // id приходит из адреса страницы: не-UUID — просто «не найден», а не ошибка приведения типа в PostgreSQL
    const id = key.id ? (UUID.test(key.id) ? key.id : undefined) : key.slug ? await this.repo.idBySlug(key.slug) : undefined;
    const master = id ? await this.cards.get(cardKey(id), () => this.load(id)) : null;
    if (!master || master.status === 'deleted') throw notFound('Мастер не найден');
    return master;
  }

  /** Гидратация выдачи: кэш карточек (MGET), промахи — одним SQL-запросом. Порядок ответа = порядок запроса. */
  async batchGet(ids: readonly string[]): Promise<catalog.Master[]> {
    const unique = [...new Set(ids)].filter((id) => UUID.test(id)).slice(0, 100);
    const found = await this.cards.getMany(unique.map(cardKey), async (missing) => {
      const rows = await this.repo.findMany(missing.map((key) => key.slice('card:'.length)));
      const offers = await this.repo.offersOf(rows.map((row) => row.id));
      return new Map(rows.map((row) => [cardKey(row.id), toMaster(row, offers.get(row.id) ?? [], this.cipher)]));
    });
    return unique.flatMap((id) => {
      const master = found.get(cardKey(id));
      return master && master.status !== 'deleted' ? [master] : [];
    });
  }

  updateProfile(request: catalog.UpdateProfileRequest): Promise<catalog.Master> {
    const name = request.name.trim();
    if (name.length < 2 || name.length > 80) throw invalid('Название — от 2 до 80 символов', 'invalid_name');
    if (request.tagline.length > 120 || request.about.length > 3000) throw invalid('Слишком длинное описание', 'invalid_text');
    return this.mutate(
      request.masterId,
      async () => ({
        name,
        tagline: request.tagline.trim(),
        about: request.about.trim(),
        address: request.address.trim(),
        brand_ids: request.brandIds,
        visit_types: request.visitTypes,
        payment_methods: request.paymentMethods,
        parts: request.parts,
        warranty_days: Math.max(0, Math.min(1095, request.warrantyDays)),
        express: request.express,
      }),
      request.expectedVersion,
    );
  }

  async upsertOffers(masterId: string, offers: catalog.Offer[]): Promise<catalog.Master> {
    if (offers.length > 200) throw invalid('Слишком много услуг', 'too_many_offers');
    const known = new Set((await this.referenceData()).services.map((service) => service.id));
    for (const offer of offers) {
      if (!known.has(offer.serviceId)) throw invalid(`Неизвестная услуга ${offer.serviceId}`, 'unknown_service');
      if (offer.priceFromMinor < 0 || (offer.priceToMinor > 0 && offer.priceToMinor < offer.priceFromMinor)) throw invalid('Некорректный диапазон цен', 'invalid_price');
    }
    return this.mutate(masterId, async (tx) => {
      await this.repo.replaceOffers(
        tx,
        masterId,
        offers.map((offer) => {
          const to = Math.max(offer.priceToMinor, offer.priceFromMinor);
          return {
            service_id: offer.serviceId,
            price_from_minor: offer.priceFromMinor,
            price_to_minor: to,
            tier_prices_minor: interpolateTiers(offer.priceFromMinor, to),
            duration_min: offer.durationMin,
            warranty_days: offer.warrantyDays,
            parts: offer.parts,
            enabled: offer.enabled,
          };
        }),
      );
      return {};
    });
  }

  setSchedule(request: catalog.SetScheduleRequest): Promise<catalog.Master> {
    const schedule = Array.from({ length: 7 }, (_, weekday) => {
      const day = request.schedule.find((item) => item.weekday === weekday);
      if (!day || day.dayOff) return null;
      if (!HHMM.test(day.open) || !HHMM.test(day.close) || day.open >= day.close) throw invalid('Часы работы в формате ЧЧ:ММ, начало раньше конца', 'invalid_schedule');
      return { open: day.open, close: day.close };
    });
    const date = /^\d{4}-\d{2}-\d{2}$/;
    if ((request.vacationFrom || request.vacationTo) && (!date.test(request.vacationFrom) || !date.test(request.vacationTo) || request.vacationFrom > request.vacationTo)) {
      throw invalid('Отпуск: даты ГГГГ-ММ-ДД, начало не позже конца', 'invalid_vacation');
    }
    const visitTypes = request.visitTypes.filter((type) => ['workshop', 'onsite', 'courier'].includes(type));
    return this.mutate(request.masterId, async () => ({
      schedule,
      accepting_leads: request.acceptingLeads,
      service_radius_km: request.serviceRadiusKm > 0 ? Math.min(request.serviceRadiusKm, 100) : 10,
      vacation_from: request.vacationFrom || null,
      vacation_to: request.vacationTo || null,
      ...(visitTypes.length ? { visit_types: visitTypes } : {}),
    }));
  }

  async categories(): Promise<catalog.Category[]> {
    const { rows } = await this.db.query<{ id: string; slug: string; name: string; status: string; services: number; masters: number }>(
      `SELECT c.id, c.slug, c.name, c.status,
              (SELECT count(*)::int FROM services s WHERE s.category_id = c.id) AS services,
              (SELECT count(DISTINCT o.master_id)::int FROM offers o JOIN services s ON s.id = o.service_id JOIN masters m ON m.id = o.master_id
                WHERE s.category_id = c.id AND o.enabled AND m.status = 'published') AS masters
         FROM categories c ORDER BY c.position`,
    );
    return rows;
  }

  async updateCategory(id: string, status: string): Promise<catalog.Category> {
    if (status !== 'active' && status !== 'soon') throw invalid('Статус категории: active или soon', 'invalid_status');
    const updated = await this.db.query('UPDATE categories SET status = $2 WHERE id = $1', [id, status]);
    if (updated.rowCount === 0) throw notFound('Категория не найдена');
    return (await this.categories()).find((category) => category.id === id)!;
  }

  /** Справочник услуг правит админка; кэш справочников в памяти пода сбрасывается сразу. */
  async updateService(request: catalog.UpdateServiceRequest): Promise<catalog.Service> {
    if (request.name !== undefined && (request.name.trim().length < 2 || request.name.length > 120)) throw invalid('Название услуги — от 2 до 120 символов', 'invalid_name');
    const updated = await this.db.query(
      'UPDATE services SET name = coalesce($2, name), description = coalesce($3, description), enabled = coalesce($4, enabled) WHERE id = $1',
      [request.id, request.name?.trim() ?? null, request.description ?? null, request.enabled ?? null],
    );
    if (updated.rowCount === 0) throw notFound('Услуга не найдена');
    this.reference = undefined;
    return (await this.referenceData()).services.find((service) => service.id === request.id)!;
  }

  /** Команда: публичные поля — в профиле, телефон сотрудника — отдельно и зашифрованным. Места зависят от тарифа. */
  async addStaff(request: catalog.AddStaffRequest): Promise<catalog.Master> {
    const phone = normalizeRuPhone(request.phone);
    if (!phone) throw invalid('Некорректный номер телефона', 'invalid_phone');
    if (!['senior', 'master', 'manager'].includes(request.role)) throw invalid('Роль: senior, master или manager', 'invalid_role');
    const name = request.name.trim();
    if (name.length < 2 || name.length > 80) throw invalid('Имя — от 2 до 80 символов', 'invalid_name');
    const staffId = `st-${uuidv7().slice(-12)}`;
    return this.mutate(request.masterId, async (tx, current) => {
      const staff = Array.isArray(current.profile.staff) ? (current.profile.staff as Array<{ role: string }>) : [];
      const limit = effectivePlan(current) === 'pro' ? 10 : 2;
      if (staff.filter((member) => member.role !== 'owner').length >= limit) throw new AppError('RESOURCE_EXHAUSTED', `На тарифе ${effectivePlan(current)} — до ${limit} сотрудников`, 'seats_limit');
      await tx.query('INSERT INTO staff_contacts (master_id, staff_id, phone_enc) VALUES ($1, $2, $3)', [request.masterId, staffId, this.cipher.encrypt(phone)]);
      return { profile: { ...current.profile, staff: [...staff, { id: staffId, name, role: request.role, experienceYears: 0, branchId: request.branchId || null }] } };
    });
  }

  async removeStaff(masterId: string, staffId: string): Promise<catalog.Master> {
    return this.mutate(masterId, async (tx, current) => {
      const staff = Array.isArray(current.profile.staff) ? (current.profile.staff as Array<{ id: string; role: string }>) : [];
      const member = staff.find((item) => item.id === staffId);
      if (!member) throw notFound('Сотрудник не найден');
      if (member.role === 'owner') throw conflict('Владельца удалить нельзя', 'owner_protected');
      await tx.query('DELETE FROM staff_contacts WHERE master_id = $1 AND staff_id = $2', [masterId, staffId]);
      return { profile: { ...current.profile, staff: staff.filter((item) => item.id !== staffId) } };
    });
  }

  async billing(masterId: string): Promise<catalog.GetBillingResponse> {
    const master = await this.repo.findById(masterId);
    if (!master) throw notFound('Мастер не найден');
    const { rows } = await this.db.query<InvoiceRow>('SELECT * FROM invoices WHERE master_id = $1 ORDER BY issued_at DESC LIMIT 50', [masterId]);
    return {
      plan: effectivePlan(master),
      planUntil: master.plan_until ? new Date(master.plan_until).toISOString() : '',
      promotionUntil: master.promotion_until ? new Date(master.promotion_until).toISOString() : '',
      invoices: rows.map(toInvoice),
    };
  }

  /** Заявка на счёт: сумму считает платформа, документ выставляет бухгалтерия на указанный email. Оплаты на сайте нет. */
  async requestInvoice(request: catalog.RequestInvoiceRequest): Promise<catalog.Invoice> {
    const amount = PRICES[request.product];
    if (!amount) throw invalid('Неизвестный продукт', 'invalid_product');
    if (!/^\d{10}(\d{2})?$/.test(request.inn)) throw invalid('ИНН — 10 или 12 цифр', 'invalid_inn');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(request.email)) throw invalid('Некорректный email', 'invalid_email');
    if (!(await this.repo.findById(request.masterId))) throw notFound('Мастер не найден');
    const { n } = (await this.db.query<{ n: number }>("SELECT nextval('invoice_number_seq')::int AS n")).rows[0]!;
    const { rows } = await this.db.query<InvoiceRow>(
      'INSERT INTO invoices (id, number, master_id, product, amount_minor, payer, inn, email_enc) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [uuidv7(), `INV-${String(n).padStart(6, '0')}`, request.masterId, request.product, amount, request.payer.trim(), request.inn, this.cipher.encrypt(request.email)],
    );
    return toInvoice(rows[0]!);
  }

  /**
   * «Счёт оплачен» из учётной системы: Pro продлевается от большей из дат (сейчас, текущий срок).
   * Продвижение включает показ в рекламных слотах только вместе с токеном erid из ОРД — его проставляет интеграция с ОРД.
   */
  async markInvoicePaid(invoiceId: string): Promise<catalog.Invoice> {
    const invoice = await this.db.transaction(async (tx) => {
      const row = (await tx.query<InvoiceRow>('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId])).rows[0];
      if (!row) throw notFound('Счёт не найден');
      if (row.status === 'paid') return row;
      if (row.status !== 'issued') throw conflict('Счёт отменён', 'invoice_cancelled');
      const days = { pro_month: 30, pro_year: 365, promotion_week: 7 }[row.product] ?? 0;
      if (row.product === 'promotion_week') {
        await tx.query("UPDATE masters SET promotion_until = greatest(coalesce(promotion_until, now()), now()) + make_interval(days => $2) WHERE id = $1", [row.master_id, days]);
      } else {
        await tx.query("UPDATE masters SET plan = 'pro', plan_until = greatest(coalesce(plan_until, now()), now()) + make_interval(days => $2) WHERE id = $1", [row.master_id, days]);
      }
      return (await tx.query<InvoiceRow>("UPDATE invoices SET status = 'paid', paid_at = now() WHERE id = $1 RETURNING *", [invoiceId])).rows[0]!;
    });
    await this.mutate(invoice.master_id, async () => ({})); // новая версия профиля: тариф виден в поиске и кабинете
    return toInvoice(invoice);
  }

  async platformStats(): Promise<catalog.GetPlatformStatsResponse> {
    const { rows } = await this.db.query<{ city_id: string; masters: number; verified: number }>(
      `SELECT city_id, count(*)::int AS masters, count(*) FILTER (WHERE (verification->>'identity')::boolean AND (verification->>'business')::boolean)::int AS verified
         FROM masters WHERE status = 'published' GROUP BY city_id ORDER BY city_id`,
    );
    return {
      cities: rows.map((row) => ({ cityId: row.city_id, masters: row.masters })),
      mastersTotal: rows.reduce((sum, row) => sum + row.masters, 0),
      verifiedTotal: rows.reduce((sum, row) => sum + row.verified, 0),
    };
  }

  async contacts(masterId: string): Promise<catalog.GetMasterContactsResponse> {
    const row = await this.repo.findById(masterId);
    if (!row || row.status !== 'published') throw notFound('Мастер не найден');
    return {
      phone: row.phone_enc ? this.cipher.decrypt(row.phone_enc) : '',
      telegram: row.telegram_enc ? this.cipher.decrypt(row.telegram_enc) : '',
      policy: row.contact_policy,
      ownerUserId: row.owner_user_id ?? '',
    };
  }

  async priceStats(cityId: string): Promise<catalog.PriceStat[]> {
    return (await this.repo.priceStats(cityId)).map((row) => ({
      cityId: row.city_id,
      serviceId: row.service_id,
      medianMinor: row.median_minor,
      p25Minor: row.p25_minor,
      p75Minor: row.p75_minor,
      masters: row.masters,
    }));
  }

  async listServices(categoryId: string): Promise<catalog.Service[]> {
    return (await this.referenceData()).services.filter((service) => !categoryId || service.categoryId === categoryId);
  }

  async listModels(brandId: string, query: string): Promise<catalog.DeviceModel[]> {
    const needle = query.trim().toLowerCase();
    return (await this.referenceData()).models.filter((model) => (!brandId || model.brandId === brandId) && (!needle || model.name.toLowerCase().includes(needle))).slice(0, 50);
  }

  /** Решение модерации (trust.moderation.v1) применяет владелец данных — catalog. Возвращает затронутые профили. */
  async applyModeration(tx: Queryable, decision: events.ModerationDecided): Promise<string[]> {
    if (decision.kind !== 'master' && decision.kind !== 'duplicate') return [];
    const status = { suspend: 'suspended', hide: 'suspended', merge: 'merged', approve: 'published', restore: 'published' }[decision.decision];
    const current = status ? await this.repo.findById(decision.subjectId, tx, true) : undefined;
    if (!status || !current || current.status === 'deleted' || current.status === status) return [];
    const updated = (await this.repo.update(tx, current.id, { status }))!;
    const offers = (await this.repo.offersOf([current.id], tx)).get(current.id) ?? [];
    await enqueue(tx, SOURCE, [{ type: 'catalog.master.upserted.v1', key: current.id, payload: toUpserted(updated, offers) }]);
    return [current.id];
  }

  /** Удаление аккаунта владельца: контакты стираются сразу, профиль скрывается, из Kafka уходит через tombstone. */
  async eraseOwner(tx: Queryable, userId: string): Promise<string[]> {
    const rows = await this.repo.byOwner(userId, tx);
    for (const row of rows) {
      await this.repo.update(tx, row.id, {
        status: 'deleted',
        name: row.kind === 'individual' ? 'Профиль удалён' : row.name,
        about: '',
        phone_enc: null,
        phone_hash: null,
        telegram_enc: null,
        owner_user_id: null,
        profile: {},
      });
      await enqueue(tx, SOURCE, [{ type: 'catalog.master.deleted.v1', key: row.id, payload: { masterId: row.id, reason: 'account_deleted' } }]);
      await enqueueTombstone(tx, SOURCE, 'catalog.master.v1', row.id);
    }
    return rows.map((row) => row.id);
  }

  async forget(ids: readonly string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.cards.invalidate(cardKey(id))));
  }

  /**
   * Изменение профиля: блокировка строки → патч → полнота → версия + 1 → снимок в outbox (одна транзакция),
   * после коммита — запись карточки в кэш (write-through).
   */
  private async mutate(masterId: string, change: (tx: Queryable, current: MasterRow) => Promise<MasterPatch>, expectedVersion = 0): Promise<catalog.Master> {
    const master = await this.db.transaction(async (tx) => {
      const current = await this.repo.findById(masterId, tx, true);
      if (!current || current.status === 'deleted') throw notFound('Мастер не найден');
      if (expectedVersion > 0 && current.version !== expectedVersion) throw conflict('Профиль изменили в другом окне — обновите страницу', 'version_conflict');
      const patch = await change(tx, current);
      const offers = (await this.repo.offersOf([masterId], tx)).get(masterId) ?? [];
      const updated = (await this.repo.update(tx, masterId, { ...patch, completeness: completenessOf({ ...current, ...patch } as MasterRow, offers.length) }))!;
      await enqueue(tx, SOURCE, [{ type: 'catalog.master.upserted.v1', key: masterId, payload: toUpserted(updated, offers) }]);
      return toMaster(updated, offers, this.cipher);
    });
    await this.cards.set(cardKey(masterId), master);
    return master;
  }

  private async load(id: string): Promise<catalog.Master | null> {
    const row = await this.repo.findById(id);
    if (!row) return null;
    const offers: OfferRow[] = (await this.repo.offersOf([id])).get(id) ?? [];
    return toMaster(row, offers, this.cipher);
  }

  /** Справочники меняются редко: держим в памяти процесса 5 минут. */
  private async referenceData() {
    if (this.reference && Date.now() - this.reference.at < 5 * 60_000) return this.reference;
    const [services, models] = await Promise.all([
      this.db.query<{ id: string; slug: string; category_id: string; name: string; description: string; duration_min: number; warranty_days: number; enabled: boolean }>('SELECT * FROM services ORDER BY id'),
      this.db.query<{ id: string; brand_id: string; name: string; year: number; tier: number }>('SELECT * FROM device_models ORDER BY brand_id, year DESC, name'),
    ]);
    this.reference = {
      at: Date.now(),
      services: services.rows.map((s) => ({ id: s.id, slug: s.slug, categoryId: s.category_id, name: s.name, description: s.description, durationMin: s.duration_min, warrantyDays: s.warranty_days, enabled: s.enabled })),
      models: models.rows.map((m) => ({ id: m.id, brandId: m.brand_id, name: m.name, year: m.year, tier: m.tier })),
    };
    return this.reference;
  }
}
