import { z } from 'zod';
import { DateTime, GeoPoint, Id, PriceRange, Rub, Slug, WeeklySchedule } from './common.js';

export const MasterKind = z.enum(['workshop', 'individual']);
export const VisitType = z.enum(['workshop', 'onsite', 'courier']);
export type VisitType = z.infer<typeof VisitType>;
export const PartsQuality = z.enum(['original', 'oem', 'copy']);
export type PartsQuality = z.infer<typeof PartsQuality>;
export const PaymentMethod = z.enum(['cash', 'card', 'sbp']);
export type PaymentMethod = z.infer<typeof PaymentMethod>;
export const Plan = z.enum(['free', 'pro']);

export const Verification = z.object({
  identity: z.boolean(),
  business: z.boolean(),
  address: z.boolean(),
  reviewedAt: DateTime,
});
export type Verification = z.infer<typeof Verification>;

export const OpenState = z.object({
  open: z.boolean(),
  closesAt: z.string().nullable(),
  opensAt: z.string().nullable(),
  inDays: z.number().int().nullable(),
});
export type OpenState = z.infer<typeof OpenState>;

/** Карточка в выдаче. Рекламные карточки обязательно маркированы (erid по 38-ФЗ «О рекламе»). */
export const MasterCard = z.object({
  id: Id,
  slug: Slug,
  kind: MasterKind,
  name: z.string(),
  initials: z.string(),
  hue: z.number().int(),
  tagline: z.string(),
  cityId: Id,
  districtName: z.string(),
  landmark: z.string(),
  address: z.string(),
  location: GeoPoint,
  rating: z.number(),
  reviewsCount: z.number().int(),
  experienceYears: z.number().int(),
  completedOrders: z.number().int(),
  responseTimeMin: z.number().int(),
  warrantyDays: z.number().int(),
  verified: z.boolean(),
  verification: Verification,
  visitTypes: z.array(VisitType),
  express: z.boolean(),
  plan: Plan,
  promoted: z.object({ erid: z.string(), advertiser: z.string() }).nullable(),
  openState: OpenState,
  distanceKm: z.number().nullable(),
  price: z.object({ serviceId: Id, modelId: Id.nullable(), range: PriceRange }).nullable(),
  serviceIds: z.array(Id),
  photosCount: z.number().int(),
  /** Превью работ для галереи карточки в выдаче (до 6): иллюстрация по услуге и подпись. */
  gallery: z.array(z.object({ id: Id, serviceId: Id, caption: z.string() })).max(6),
  /** «От» по самым востребованным услугам мастера: цена видна в выдаче, даже если услуга не выбрана. */
  offersPreview: z.array(z.object({ serviceId: Id, priceFrom: Rub })).max(3),
});
export type MasterCard = z.infer<typeof MasterCard>;

export const MasterLite = MasterCard.pick({
  id: true,
  slug: true,
  name: true,
  initials: true,
  hue: true,
  rating: true,
  reviewsCount: true,
  verified: true,
  districtName: true,
  responseTimeMin: true,
});
export type MasterLite = z.infer<typeof MasterLite>;

export const Offer = z.object({
  serviceId: Id,
  priceFrom: Rub,
  priceTo: Rub,
  durationMin: z.number().int(),
  warrantyDays: z.number().int(),
  parts: z.array(PartsQuality),
  modelPrice: PriceRange.nullable(),
});
export type Offer = z.infer<typeof Offer>;

export const Photo = z.object({
  id: Id,
  serviceId: Id,
  modelId: Id,
  caption: z.string(),
  status: z.enum(['approved', 'pending', 'rejected']),
});
export type Photo = z.infer<typeof Photo>;

export const Branch = z.object({ id: Id, name: z.string(), address: z.string(), districtName: z.string(), location: GeoPoint });
export type Branch = z.infer<typeof Branch>;

export const StaffRole = z.enum(['owner', 'senior', 'master', 'manager']);
export const StaffMember = z.object({ id: Id, name: z.string(), role: StaffRole, experienceYears: z.number().int() });
export type StaffMember = z.infer<typeof StaffMember>;

export const MasterProfile = MasterCard.extend({
  about: z.string(),
  joinedAt: DateTime,
  timezone: z.string(),
  ratingDistribution: z.array(z.number().int()).length(5),
  responseRate: z.number(),
  brandIds: z.array(Id),
  paymentMethods: z.array(PaymentMethod),
  partsQualities: z.array(PartsQuality),
  schedule: WeeklySchedule,
  photos: z.array(Photo),
  branches: z.array(Branch),
  staff: z.array(StaffMember),
  offers: z.array(Offer),
  contacts: z.object({ phoneMasked: z.string(), hasTelegram: z.boolean(), hasWhatsapp: z.boolean() }),
});
export type MasterProfile = z.infer<typeof MasterProfile>;

/** Раскрытие контактов логируется: защита от скрейпинга и спама, аудит для 152-ФЗ. */
export const ContactReveal = z.object({
  revealId: Id,
  phone: z.string(),
  telegram: z.string().nullable(),
  whatsapp: z.string().nullable(),
  expiresAt: DateTime,
});
export type ContactReveal = z.infer<typeof ContactReveal>;
