import { z } from 'zod';

export const Id = z.string().min(1).max(64);
export const Slug = z.string().regex(/^[a-z0-9-]+$/).max(160);
export const DateTime = z.iso.datetime({ offset: true });
export const Rub = z.number().int().nonnegative().describe('Сумма в рублях (информационно — оплата только напрямую мастеру)');

export const GeoPoint = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type GeoPoint = z.infer<typeof GeoPoint>;

export const PriceRange = z.object({ from: Rub, to: Rub.nullable() });
export type PriceRange = z.infer<typeof PriceRange>;

export const Ref = z.object({ id: Id, name: z.string() });
export type Ref = z.infer<typeof Ref>;

/** Keyset-пагинация: курсор вместо OFFSET — стабильная латентность на любых глубинах. */
export const page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative(),
  });

/** RFC 9457 Problem Details — единый формат ошибок шлюза. */
export const Problem = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  code: z.string().optional(),
  traceId: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type Problem = z.infer<typeof Problem>;

export const Ok = z.object({ ok: z.literal(true) });

export const Weekday = z.object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/) }).nullable();
export const WeeklySchedule = z.array(Weekday).length(7);
export type WeeklySchedule = z.infer<typeof WeeklySchedule>;
