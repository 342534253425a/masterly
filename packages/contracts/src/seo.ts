import { z } from 'zod';
import { Id, Ref, Rub } from './common.js';
import { City, Service } from './catalog.js';
import { MasterCard, Offer, PaymentMethod, PartsQuality } from './master.js';

export const Landing = z.object({
  city: City,
  service: Service.nullable(),
  model: Ref.nullable(),
  stats: z.object({
    mastersCount: z.number().int(),
    priceFrom: Rub,
    priceMedian: Rub,
    avgRating: z.number(),
    reviewsCount: z.number().int(),
    avgResponseMin: z.number().int(),
  }),
  topMasters: z.array(MasterCard),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  related: z.array(z.object({ title: z.string(), city: z.string(), service: z.string() })),
});
export type Landing = z.infer<typeof Landing>;

export const CompareQuery = z.object({
  ids: z.string().regex(/^[\w-]+(,[\w-]+){0,3}$/, 'От 1 до 4 мастеров'),
  service: z.string().optional(),
  model: z.string().optional(),
});

export const CompareItem = MasterCard.extend({
  offer: Offer.nullable(),
  paymentMethods: z.array(PaymentMethod),
  partsQualities: z.array(PartsQuality),
  responseRate: z.number(),
});
export type CompareItem = z.infer<typeof CompareItem>;

export const CompareResponse = z.object({
  service: Ref.nullable(),
  model: Ref.nullable(),
  items: z.array(CompareItem),
  /** Лучшие значения по критериям — подсвечиваем в таблице. */
  best: z.object({
    price: Id.nullable(),
    rating: Id.nullable(),
    warranty: Id.nullable(),
    response: Id.nullable(),
    distance: Id.nullable(),
  }),
});
export type CompareResponse = z.infer<typeof CompareResponse>;
