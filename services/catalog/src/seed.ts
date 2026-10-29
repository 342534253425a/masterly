import { BRANDS, CATEGORIES, DEMO_ACCOUNTS, getMasters, MODELS, offersFor, pickDemoMaster, priceFor, SERVICES, type MasterFixture } from '@masterly/fixtures';
import { geohashEncode } from '@masterly/kernel';
import { enqueue, type Db, type FieldCipher } from '@masterly/platform';
import { CatalogRepository, type MasterRow, type OfferRow } from './repository.js';
import { completenessOf, toUpserted } from './snapshot.js';

/** Справочники услуг и устройств (идемпотентно, на каждом старте). */
export async function seedReferenceData(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [position, category] of CATEGORIES.entries()) {
      await tx.query('INSERT INTO categories (id, slug, name, status, position) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING', [category.id, category.slug, category.name, category.status, position]);
    }
    for (const service of SERVICES) {
      await tx.query('INSERT INTO services (id, slug, category_id, name, description, duration_min, warranty_days) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING', [
        service.id, service.slug, service.categoryId, service.name, service.description, service.durationMin, service.warrantyDays,
      ]);
    }
    for (const brand of BRANDS) await tx.query('INSERT INTO brands (id, slug, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [brand.id, brand.slug, brand.name]);
    for (const model of MODELS) {
      await tx.query('INSERT INTO device_models (id, brand_id, name, year, tier) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING', [model.id, model.brandId, model.name, model.year, model.tier]);
    }
  });
}

/** Цена «от» по сегментам устройств 1…5 на основе моделей, с которыми работает мастер (копейки). */
function tierPrices(master: MasterFixture, serviceId: string): number[] {
  return [1, 2, 3, 4, 5].map((tier) => {
    const prices = MODELS.filter((model) => model.tier === tier)
      .map((model) => priceFor(master, serviceId, model)?.from)
      .filter((price): price is number => price !== undefined);
    return prices.length ? Math.min(...prices) * 100 : 0;
  });
}

/**
 * Демо-каталог (SEED_DEMO=true): те же 208 мастеров, что в мок-бэкенде фронтенда, с событиями в outbox —
 * поиск, антифрод и аналитика локального стека получают данные обычным путём через Kafka.
 */
export async function seedDemoMasters(db: Db, cipher: FieldCipher, hmac: (phone: string) => string = cipher.hash): Promise<number> {
  const masters = getMasters();
  const demoId = pickDemoMaster(masters).id;
  let inserted = 0;
  for (let start = 0; start < masters.length; start += 25) {
    await db.transaction(async (tx) => {
      for (const fixture of masters.slice(start, start + 25)) {
        const profile = {
          initials: fixture.initials, hue: fixture.hue, landmark: fixture.landmark, photos: fixture.photos, branches: fixture.branches, staff: fixture.staff,
          completedOrders: fixture.completedOrders, responseRate: fixture.responseRate, joinedAt: fixture.joinedAt, whatsapp: fixture.whatsapp,
          ratingDistribution: fixture.ratingDistribution, specialization: fixture.specialization, priceLevel: fixture.priceLevel, serviceIds: fixture.serviceIds,
        };
        const offers: OfferRow[] = offersFor(fixture).map((offer) => ({
          master_id: fixture.id, service_id: offer.serviceId, price_from_minor: offer.priceFrom * 100, price_to_minor: offer.priceTo * 100,
          tier_prices_minor: tierPrices(fixture, offer.serviceId), duration_min: offer.durationMin, warranty_days: offer.warrantyDays, parts: offer.parts, enabled: true,
        }));
        const row = {
          id: fixture.id, slug: fixture.slug, owner_user_id: fixture.id === demoId ? DEMO_ACCOUNTS.master.id : null, kind: fixture.kind, name: fixture.name,
          tagline: fixture.tagline, about: fixture.about, city_id: fixture.cityId, district_id: fixture.districtId, address: fixture.address,
          lat: fixture.location.lat, lng: fixture.location.lng, geohash: geohashEncode(fixture.location, 9), rating: fixture.rating, reviews_count: fixture.reviewsCount,
          experience_years: fixture.experienceYears, response_time_min: fixture.responseTimeMin, warranty_days: fixture.warrantyDays, verification: fixture.verification,
          visit_types: fixture.visitTypes, payment_methods: fixture.paymentMethods, parts: fixture.partsQualities, brand_ids: fixture.brandIds, express: fixture.express,
          plan: fixture.plan, promotion_erid: fixture.promotion?.erid ?? '', contact_policy: 'reveal', phone_enc: cipher.encrypt(fixture.phone), phone_hash: hmac(fixture.phone),
          telegram_enc: fixture.telegram ? cipher.encrypt(fixture.telegram) : null, schedule: [...fixture.schedule], accepting_leads: true, service_radius_km: 10,
          completeness: 0, status: 'published', profile, version: 1,
        } satisfies MasterRow;
        row.completeness = completenessOf(row, offers.length);

        const columns = Object.keys(row) as Array<keyof typeof row>;
        const values = columns.map((column) => (column === 'verification' || column === 'schedule' || column === 'profile' ? JSON.stringify(row[column]) : row[column]));
        const result = await tx.query(`INSERT INTO masters (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) ON CONFLICT (id) DO NOTHING RETURNING id`, values);
        if (result.rowCount === 0) continue;
        const repo = new CatalogRepository(db);
        for (const offer of offers) await repo.insertOffer(tx, offer);
        await enqueue(tx, 'catalog', [{ type: 'catalog.master.upserted.v1', key: row.id, payload: toUpserted(row, offers) }]);
        inserted++;
      }
    });
  }
  return inserted;
}
