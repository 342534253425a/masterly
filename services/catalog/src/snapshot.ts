import { maskPhone } from '@masterly/kernel';
import type { FieldCipher } from '@masterly/platform';
import type { catalog, events } from '@masterly/proto';
import type { MasterRow, OfferRow } from './repository.js';

/** Pro действует до plan_until (без даты — бессрочно: исторические и демо-профили). */
export function effectivePlan(row: Pick<MasterRow, 'plan' | 'plan_until'>, now = Date.now()): string {
  return row.plan === 'pro' && (!row.plan_until || new Date(row.plan_until).getTime() > now) ? 'pro' : 'free';
}

const day = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString().slice(0, 10) : '');

/** В отпуске мастер не получает заявок, а поиск не предлагает его в рассылку. */
export function onVacation(row: Pick<MasterRow, 'vacation_from' | 'vacation_to'>, now = new Date()): boolean {
  const today = now.toISOString().slice(0, 10);
  return !!row.vacation_from && !!row.vacation_to && day(row.vacation_from) <= today && today <= day(row.vacation_to);
}

/** Профиль в ответе gRPC: телефон только замаскированный, полные контакты — через GetMasterContacts. */
export function toMaster(row: MasterRow, offers: OfferRow[], cipher: FieldCipher): catalog.Master {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    name: row.name,
    tagline: row.tagline,
    about: row.about,
    cityId: row.city_id,
    districtId: row.district_id,
    address: row.address,
    location: { lat: row.lat, lng: row.lng },
    rating: row.rating,
    reviewsCount: row.reviews_count,
    experienceYears: row.experience_years,
    responseTimeMin: row.response_time_min,
    warrantyDays: row.warranty_days,
    verification: {
      identity: !!row.verification.identity,
      business: !!row.verification.business,
      address: !!row.verification.address,
      reviewedAt: row.verification.reviewedAt ?? '',
    },
    visitTypes: row.visit_types,
    express: row.express,
    plan: effectivePlan(row),
    promotionErid: row.promotion_erid,
    brandIds: row.brand_ids,
    offers: offers.map((offer) => ({
      serviceId: offer.service_id,
      priceFromMinor: offer.price_from_minor,
      priceToMinor: offer.price_to_minor,
      durationMin: offer.duration_min,
      warrantyDays: offer.warranty_days,
      parts: offer.parts,
      enabled: offer.enabled,
    })),
    schedule: row.schedule.map((day, weekday) => ({ weekday, open: day?.open ?? '', close: day?.close ?? '', dayOff: day === null })),
    phoneMasked: row.phone_enc ? maskPhone(cipher.decrypt(row.phone_enc)) : '',
    status: row.status,
    version: row.version,
    paymentMethods: row.payment_methods,
    parts: row.parts,
    acceptingLeads: row.accepting_leads,
    serviceRadiusKm: row.service_radius_km,
    contactPolicy: row.contact_policy,
    completeness: row.completeness,
    ownerUserId: row.owner_user_id ?? '',
    profileJson: JSON.stringify(row.profile),
    hasTelegram: !!row.telegram_enc,
    vacationFrom: day(row.vacation_from),
    vacationTo: day(row.vacation_to),
    planUntil: row.plan_until ? new Date(row.plan_until).toISOString() : '',
  };
}

/** Полный снимок для компактированного catalog.master.v1 (event-carried state transfer). */
export function toUpserted(row: MasterRow, offers: OfferRow[]): events.MasterUpserted {
  return {
    masterId: row.id,
    slug: row.slug,
    cityId: row.city_id,
    districtId: row.district_id,
    name: row.name,
    tagline: row.tagline,
    lat: row.lat,
    lng: row.lng,
    rating: row.rating,
    reviewsCount: row.reviews_count,
    responseTimeMin: row.response_time_min,
    warrantyDays: row.warranty_days,
    verified: !!(row.verification.identity && row.verification.business),
    express: row.express,
    plan: effectivePlan(row),
    promotionErid: row.promotion_erid,
    brandIds: row.brand_ids,
    visitTypes: row.visit_types,
    parts: row.parts,
    offers: offers
      .filter((offer) => offer.enabled)
      .map((offer) => ({
        serviceId: offer.service_id,
        priceFromMinor: offer.price_from_minor,
        priceToMinor: offer.price_to_minor,
        tierPricesMinor: offer.tier_prices_minor,
        durationMin: offer.duration_min,
        warrantyDays: offer.warranty_days,
      })),
    openHours: row.schedule.flatMap((day, weekday) => (day ? [`${weekday}:${day.open}-${day.close}`] : [])),
    completeness: row.completeness,
    status: row.status,
    version: row.version,
    phoneHash: row.phone_hash ?? '',
    ownerUserId: row.owner_user_id ?? '',
    acceptingLeads: row.accepting_leads && !onVacation(row),
    serviceRadiusKm: row.service_radius_km,
  };
}

/** Полнота профиля (0–100) — фактор ранжирования и подсказка мастеру в кабинете. */
export function completenessOf(row: Pick<MasterRow, 'tagline' | 'about' | 'address' | 'brand_ids' | 'schedule' | 'verification' | 'phone_enc' | 'profile'>, offers: number): number {
  const photos = Array.isArray(row.profile.photos) ? row.profile.photos.length : 0;
  const checks = [
    row.tagline.length >= 10,
    row.about.length >= 80,
    row.address.length > 0,
    row.brand_ids.length > 0,
    offers > 0,
    offers >= 3,
    row.schedule.some((day) => day !== null),
    photos >= 3,
    !!row.verification.identity,
    !!row.phone_enc,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
