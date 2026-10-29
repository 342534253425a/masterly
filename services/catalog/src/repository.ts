import { Inject, Injectable } from '@nestjs/common';
import { DB, type Db, type Queryable } from '@masterly/platform';

export interface DayHours {
  open: string;
  close: string;
}

export interface MasterRow {
  id: string;
  slug: string;
  owner_user_id: string | null;
  kind: string;
  name: string;
  tagline: string;
  about: string;
  city_id: string;
  district_id: string;
  address: string;
  lat: number;
  lng: number;
  geohash: string;
  rating: number;
  reviews_count: number;
  experience_years: number;
  response_time_min: number;
  warranty_days: number;
  verification: { identity?: boolean; business?: boolean; address?: boolean; reviewedAt?: string };
  visit_types: string[];
  payment_methods: string[];
  parts: string[];
  brand_ids: string[];
  express: boolean;
  plan: string;
  promotion_erid: string;
  contact_policy: string;
  phone_enc: string | null;
  phone_hash: string | null;
  telegram_enc: string | null;
  schedule: Array<DayHours | null>;
  accepting_leads: boolean;
  service_radius_km: number;
  completeness: number;
  status: string;
  profile: Record<string, unknown>;
  version: number;
  plan_until?: Date | string | null;
  promotion_until?: Date | string | null;
  vacation_from?: Date | string | null;
  vacation_to?: Date | string | null;
}

export interface OfferRow {
  master_id: string;
  service_id: string;
  price_from_minor: number;
  price_to_minor: number;
  tier_prices_minor: number[];
  duration_min: number;
  warranty_days: number;
  parts: string[];
  enabled: boolean;
}

export type MasterPatch = Partial<Omit<MasterRow, 'id' | 'version'>>;

/** Явный SQL каталога: каждый запрос опирается на индекс из миграций. */
@Injectable()
export class CatalogRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findById(id: string, q: Queryable = this.db, lock = false): Promise<MasterRow | undefined> {
    const { rows } = await q.query<MasterRow>(`SELECT * FROM masters WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
    return rows[0];
  }

  async idBySlug(slug: string): Promise<string | undefined> {
    const { rows } = await this.db.query<{ id: string }>('SELECT id FROM masters WHERE slug = $1', [slug]);
    return rows[0]?.id;
  }

  async findMany(ids: readonly string[]): Promise<MasterRow[]> {
    if (ids.length === 0) return [];
    const { rows } = await this.db.query<MasterRow>('SELECT * FROM masters WHERE id = ANY($1::uuid[])', [ids]);
    return rows;
  }

  async byOwner(userId: string, q: Queryable = this.db): Promise<MasterRow[]> {
    const { rows } = await q.query<MasterRow>('SELECT * FROM masters WHERE owner_user_id = $1 FOR UPDATE', [userId]);
    return rows;
  }

  async offersOf(ids: readonly string[], q: Queryable = this.db): Promise<Map<string, OfferRow[]>> {
    const result = new Map<string, OfferRow[]>(ids.map((id) => [id, []]));
    if (ids.length === 0) return result;
    const { rows } = await q.query<OfferRow>('SELECT * FROM offers WHERE master_id = ANY($1::uuid[]) ORDER BY service_id', [ids]);
    for (const row of rows) result.get(row.master_id)?.push(row);
    return result;
  }

  /** Частичное обновление с инкрементом версии; expectedVersion > 0 — оптимистичная блокировка. */
  async update(q: Queryable, id: string, patch: MasterPatch, expectedVersion = 0): Promise<MasterRow | undefined> {
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
    const sets = entries.map(([column], index) => `${column} = $${index + 3}`);
    const { rows } = await q.query<MasterRow>(
      `UPDATE masters SET ${[...sets, 'version = version + 1', 'updated_at = now()'].join(', ')}
       WHERE id = $1 AND ($2::bigint = 0 OR version = $2::bigint) RETURNING *`,
      [id, expectedVersion, ...entries.map(([column, value]) => (column === 'verification' || column === 'schedule' || column === 'profile' ? JSON.stringify(value) : value))],
    );
    return rows[0];
  }

  async replaceOffers(q: Queryable, masterId: string, offers: Array<Omit<OfferRow, 'master_id'>>): Promise<void> {
    await q.query('DELETE FROM offers WHERE master_id = $1', [masterId]);
    for (const offer of offers) await this.insertOffer(q, { ...offer, master_id: masterId });
  }

  async insertOffer(q: Queryable, offer: OfferRow): Promise<void> {
    await q.query(
      `INSERT INTO offers (master_id, service_id, price_from_minor, price_to_minor, tier_prices_minor, duration_min, warranty_days, parts, enabled)
       VALUES ($1, $2, $3, $4, $5::integer[], $6, $7, $8::text[], $9) ON CONFLICT (master_id, service_id) DO NOTHING`,
      [offer.master_id, offer.service_id, offer.price_from_minor, offer.price_to_minor, offer.tier_prices_minor, offer.duration_min, offer.warranty_days, offer.parts, offer.enabled],
    );
  }

  async priceStats(cityId: string) {
    const { rows } = await this.db.query<{ city_id: string; service_id: string; median_minor: number; p25_minor: number; p75_minor: number; masters: number }>(
      `SELECT m.city_id, o.service_id,
              percentile_cont(0.5)  WITHIN GROUP (ORDER BY o.price_from_minor)::bigint AS median_minor,
              percentile_cont(0.25) WITHIN GROUP (ORDER BY o.price_from_minor)::bigint AS p25_minor,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY o.price_from_minor)::bigint AS p75_minor,
              count(DISTINCT m.id)::int AS masters
         FROM offers o JOIN masters m ON m.id = o.master_id
        WHERE o.enabled AND m.status = 'published' AND ($1::text = '' OR m.city_id = $1::text)
        GROUP BY m.city_id, o.service_id
        ORDER BY m.city_id, o.service_id`,
      [cityId],
    );
    return rows;
  }
}
