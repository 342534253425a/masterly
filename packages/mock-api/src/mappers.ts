import type { MasterCard, MasterLite, MasterProfile, Offer, OpenState, PriceRange, Review } from '@masterly/contracts';
import {
  cityById,
  modelById,
  offersFor,
  priceFor,
  serviceById,
  type MasterFixture,
  type ModelFixture,
  type OfferFixture,
  type ReviewFixture,
} from '@masterly/fixtures';
import { haversineKm, maskPhone, openState, roundPrice } from '@masterly/kernel';
import { getDb } from './db.js';

const offerCache = new WeakMap<MasterFixture, OfferFixture[]>();

const factorOf = (master: MasterFixture, serviceId: string) => getDb().priceFactors.get(`${master.id}:${serviceId}`) ?? 1;
const scale = (price: number, factor: number) => (factor === 1 ? price : roundPrice(price * factor));

/** Базовые офферы из фикстур + правки мастера из кабинета (цены, сроки, отключённые услуги). */
export function offersOf(master: MasterFixture): OfferFixture[] {
  let offers = offerCache.get(master);
  if (!offers) {
    const db = getDb();
    const disabled = db.disabledServices.get(master.id);
    offers = offersFor(master)
      .filter((offer) => !disabled?.has(offer.serviceId))
      .map((offer) => {
        const factor = factorOf(master, offer.serviceId);
        const override = db.offerOverrides.get(`${master.id}:${offer.serviceId}`);
        return { ...offer, ...override, priceFrom: scale(offer.priceFrom, factor), priceTo: scale(offer.priceTo, factor) };
      });
    offerCache.set(master, offers);
  }
  return offers;
}

export const invalidateOffers = (master: MasterFixture) => offerCache.delete(master);

export function effectiveServiceIds(master: MasterFixture): string[] {
  const disabled = getDb().disabledServices.get(master.id);
  return disabled ? master.serviceIds.filter((id) => !disabled.has(id)) : master.serviceIds;
}

function modelPrice(master: MasterFixture, serviceId: string, model: ModelFixture): PriceRange | null {
  if (getDb().disabledServices.get(master.id)?.has(serviceId)) return null;
  const price = priceFor(master, serviceId, model);
  if (!price) return null;
  const factor = factorOf(master, serviceId);
  return { from: scale(price.from, factor), to: price.to === null ? null : scale(price.to, factor) };
}

export const districtNameOf = (master: MasterFixture): string =>
  cityById.get(master.cityId)?.districts.find((d) => d.id === master.districtId)?.name ?? '';

export const timezoneOf = (master: MasterFixture): string => cityById.get(master.cityId)?.timezone ?? 'Europe/Moscow';

export const isVerified = (master: MasterFixture): boolean =>
  master.verification.identity && (master.verification.business || master.verification.address);

export function toOpenState(master: MasterFixture, now = new Date()): OpenState {
  const state = openState(master.schedule, timezoneOf(master), now);
  return state.open
    ? { open: true, closesAt: state.closesAt, opensAt: null, inDays: null }
    : { open: false, closesAt: null, opensAt: state.opensAt, inDays: state.inDays };
}

/** Цена мастера на услугу: для конкретной модели — точная вилка, без модели — «от». */
export function priceRangeOf(master: MasterFixture, serviceId: string, model?: ModelFixture | null): PriceRange | null {
  if (model) return modelPrice(master, serviceId, model);
  const offer = offersOf(master).find((o) => o.serviceId === serviceId);
  return offer ? { from: offer.priceFrom, to: null } : null;
}

export interface CardContext {
  serviceId?: string | null;
  model?: ModelFixture | null;
  origin?: { lat: number; lng: number } | null;
  now?: Date;
}

export function toMasterCard(master: MasterFixture, ctx: CardContext = {}): MasterCard {
  const range = ctx.serviceId ? priceRangeOf(master, ctx.serviceId, ctx.model) : null;
  return {
    id: master.id,
    slug: master.slug,
    kind: master.kind,
    name: master.name,
    initials: master.initials,
    hue: master.hue,
    tagline: master.tagline,
    cityId: master.cityId,
    districtName: districtNameOf(master),
    landmark: master.landmark,
    address: master.address,
    location: master.location,
    rating: master.rating,
    reviewsCount: master.reviewsCount,
    experienceYears: master.experienceYears,
    completedOrders: master.completedOrders,
    responseTimeMin: master.responseTimeMin,
    warrantyDays: master.warrantyDays,
    verified: isVerified(master),
    verification: master.verification,
    visitTypes: master.visitTypes,
    express: master.express,
    plan: master.plan,
    promoted: master.promotion ? { erid: master.promotion.erid, advertiser: master.name } : null,
    openState: toOpenState(master, ctx.now),
    distanceKm: ctx.origin ? Math.round(haversineKm(ctx.origin, master.location) * 10) / 10 : null,
    price: ctx.serviceId && range ? { serviceId: ctx.serviceId, modelId: ctx.model?.id ?? null, range } : null,
    serviceIds: effectiveServiceIds(master),
    photosCount: master.photos.length,
  };
}

export function toMasterLite(master: MasterFixture): MasterLite {
  return {
    id: master.id,
    slug: master.slug,
    name: master.name,
    initials: master.initials,
    hue: master.hue,
    rating: master.rating,
    reviewsCount: master.reviewsCount,
    verified: isVerified(master),
    districtName: districtNameOf(master),
    responseTimeMin: master.responseTimeMin,
  };
}

export function toOffer(master: MasterFixture, offer: OfferFixture, model?: ModelFixture | null): Offer {
  return { ...offer, modelPrice: model ? modelPrice(master, offer.serviceId, model) : null };
}

export function toMasterProfile(master: MasterFixture, ctx: CardContext = {}): MasterProfile {
  const city = cityById.get(master.cityId)!;
  return {
    ...toMasterCard(master, ctx),
    about: master.about,
    joinedAt: master.joinedAt,
    timezone: city.timezone,
    ratingDistribution: [...master.ratingDistribution],
    responseRate: master.responseRate,
    brandIds: master.brandIds,
    paymentMethods: master.paymentMethods,
    partsQualities: master.partsQualities,
    schedule: [...master.schedule],
    photos: master.photos.map((photo) => ({ id: photo.id, serviceId: photo.serviceId, modelId: photo.modelId, caption: photo.caption, status: 'approved' as const })),
    branches: master.branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      address: branch.address,
      location: branch.location,
      districtName: city.districts.find((d) => d.id === branch.districtId)?.name ?? '',
    })),
    staff: master.staff.map((member) => ({ id: member.id, name: member.name, role: member.role, experienceYears: member.experienceYears })),
    offers: offersOf(master).map((offer) => toOffer(master, offer, ctx.model)),
    contacts: { phoneMasked: maskPhone(master.phone), hasTelegram: Boolean(master.telegram), hasWhatsapp: master.whatsapp },
  };
}

export const initialsOf = (name: string): string =>
  name
    .replace(/[«»".]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

export function toReview(review: ReviewFixture, reply?: { text: string; createdAt: string } | null): Review {
  const service = serviceById.get(review.serviceId);
  const model = modelById.get(review.modelId);
  return {
    id: review.id,
    masterId: review.masterId,
    author: { name: review.authorName, initials: initialsOf(review.authorName) },
    rating: review.rating,
    text: review.text,
    service: { id: review.serviceId, name: service?.name ?? review.serviceId },
    model: model ? { id: model.id, name: model.name } : null,
    createdAt: review.createdAt,
    verified: review.verified,
    photos: review.photos,
    helpful: review.helpful,
    reply: reply ?? review.reply,
  };
}
