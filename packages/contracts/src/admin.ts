import { z } from 'zod';
import { DateTime, Id, Rub } from './common.js';
import { Category, Service } from './catalog.js';
import { MasterLite } from './master.js';
import { Role } from './user.js';

export const ModerationKind = z.enum(['profile', 'photo', 'review', 'description']);
export const ModerationStatus = z.enum(['pending', 'approved', 'rejected', 'escalated']);

export const RiskReason = z.object({ code: z.string(), label: z.string(), weight: z.number() });

export const ModerationItem = z.object({
  id: Id,
  kind: ModerationKind,
  status: ModerationStatus,
  createdAt: DateTime,
  title: z.string(),
  content: z.string(),
  riskScore: z.number().min(0).max(1),
  reasons: z.array(RiskReason),
  master: MasterLite.nullable(),
  author: z.string().nullable(),
});
export type ModerationItem = z.infer<typeof ModerationItem>;

export const ModerationDecision = z.object({
  decision: z.enum(['approve', 'reject', 'escalate']),
  reasonCode: z.string().max(64).optional(),
  note: z.string().max(500).optional(),
});
export type ModerationDecision = z.infer<typeof ModerationDecision>;

export const DuplicateSignal = z.object({
  code: z.enum(['phone', 'name', 'address', 'geo', 'photos', 'telegram']),
  label: z.string(),
  value: z.number(),
  matched: z.boolean(),
});

export const DuplicateCandidate = z.object({
  id: Id,
  score: z.number().min(0).max(1),
  a: MasterLite,
  b: MasterLite,
  signals: z.array(DuplicateSignal),
  status: z.enum(['open', 'merged', 'dismissed']),
});
export type DuplicateCandidate = z.infer<typeof DuplicateCandidate>;

export const ResolveDuplicate = z.object({ action: z.enum(['merge', 'dismiss']), primaryId: Id.optional() });

export const AdminOverview = z.object({
  kpis: z.array(z.object({ key: z.string(), label: z.string(), value: z.number(), delta: z.number(), format: z.enum(['int', 'percent', 'minutes']) })),
  searches: z.array(z.object({ date: z.string(), total: z.number().int(), zeroResults: z.number().int() })),
  leadsByCity: z.array(z.object({ cityId: Id, name: z.string(), leads: z.number().int(), masters: z.number().int() })),
  moderation: z.object({ pending: z.number().int(), highRisk: z.number().int(), slaBreached: z.number().int() }),
  topCategories: z.array(z.object({ id: Id, name: z.string(), searches: z.number().int(), share: z.number() })),
});
export type AdminOverview = z.infer<typeof AdminOverview>;

export const SearchGap = z.object({ query: z.string(), count: z.number().int(), trend: z.number(), categoryHint: z.string() });
export type SearchGap = z.infer<typeof SearchGap>;

export const PriceStat = z.object({
  serviceId: Id,
  serviceName: z.string(),
  cityId: Id,
  cityName: z.string(),
  min: Rub,
  median: Rub,
  max: Rub,
  mastersCount: z.number().int(),
});
export type PriceStat = z.infer<typeof PriceStat>;

export const AdminService = Service.extend({
  enabled: z.boolean(),
  searches30d: z.number().int(),
  leads30d: z.number().int(),
  conversion: z.number(),
});
export type AdminService = z.infer<typeof AdminService>;

export const UpdateAdminService = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(1000).optional(),
  enabled: z.boolean().optional(),
});

export const AdminCategory = Category.extend({ services: z.number().int(), masters: z.number().int() });
export const UpdateCategory = z.object({ status: Category.shape.status });

export const AdminUser = z.object({
  id: Id,
  name: z.string(),
  phoneMasked: z.string(),
  roles: z.array(Role),
  status: z.enum(['active', 'blocked']),
  createdAt: DateTime,
  leadsCount: z.number().int(),
  lastSeenAt: DateTime,
});
export type AdminUser = z.infer<typeof AdminUser>;
export const UpdateAdminUser = z.object({ roles: z.array(Role).min(1).optional(), status: z.enum(['active', 'blocked']).optional() });
