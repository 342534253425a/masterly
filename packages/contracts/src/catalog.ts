import { z } from 'zod';
import { GeoPoint, Id, Rub, Slug } from './common.js';

export const City = z.object({
  id: Id,
  slug: Slug,
  name: z.string(),
  nameIn: z.string(),
  timezone: z.string(),
  center: GeoPoint,
  zoom: z.number(),
  hasMetro: z.boolean(),
  mastersCount: z.number().int(),
  districts: z.array(z.object({ id: Id, name: z.string(), center: GeoPoint })),
});
export type City = z.infer<typeof City>;

export const CategoryStatus = z.enum(['active', 'soon']);
export const Category = z.object({
  id: Id,
  slug: Slug,
  name: z.string(),
  icon: z.string(),
  status: CategoryStatus,
  waitlist: z.number().int(),
});
export type Category = z.infer<typeof Category>;

export const Service = z.object({
  id: Id,
  slug: Slug,
  categoryId: Id,
  name: z.string(),
  short: z.string(),
  description: z.string(),
  icon: z.string(),
  problem: z.string(),
  priceFrom: Rub,
  priceMedian: Rub,
  durationMin: z.number().int(),
  warrantyDays: z.number().int(),
  partsChoice: z.boolean(),
  brandIds: z.array(Id).nullable(),
  mastersCount: z.number().int(),
});
export type Service = z.infer<typeof Service>;

export const Brand = z.object({
  id: Id,
  slug: Slug,
  name: z.string(),
  popular: z.boolean(),
  modelsCount: z.number().int(),
});
export type Brand = z.infer<typeof Brand>;

export const DeviceModel = z.object({
  id: Id,
  slug: Slug,
  brandId: Id,
  name: z.string(),
  fullName: z.string(),
  year: z.number().int(),
  tier: z.number().int().min(1).max(5),
});
export type DeviceModel = z.infer<typeof DeviceModel>;
