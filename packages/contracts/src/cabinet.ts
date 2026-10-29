import { z } from 'zod';
import { DateTime, GeoPoint, Id, Rub, WeeklySchedule } from './common.js';
import { CabinetLead } from './lead.js';
import { MasterLite, PartsQuality, PaymentMethod, Plan, StaffRole, VisitType } from './master.js';

export const KpiKey = z.enum(['impressions', 'views', 'contacts', 'leads', 'conversion', 'response']);
export const Kpi = z.object({
  key: KpiKey,
  value: z.number(),
  delta: z.number().describe('Изменение к прошлому периоду, доля'),
  series: z.array(z.number()),
});
export type Kpi = z.infer<typeof Kpi>;

export const FunnelStage = z.object({
  stage: z.enum(['impressions', 'views', 'contacts', 'leads', 'completed']),
  value: z.number().int(),
});

export const CabinetOverview = z.object({
  master: MasterLite,
  plan: Plan,
  kpis: z.array(Kpi),
  funnel: z.array(FunnelStage),
  topServices: z.array(z.object({ serviceId: Id, name: z.string(), leads: z.number().int(), share: z.number() })),
  topQueries: z.array(z.object({ query: z.string(), views: z.number().int(), leads: z.number().int() })),
  completeness: z.object({
    score: z.number().int(),
    missing: z.array(z.object({ key: z.string(), label: z.string(), impact: z.number().int() })),
  }),
  recentLeads: z.array(CabinetLead),
  benchmarks: z.object({ responseTimeMin: z.number(), cityResponseTimeMin: z.number(), priceIndex: z.number() }),
  unansweredReviews: z.number().int(),
});
export type CabinetOverview = z.infer<typeof CabinetOverview>;

export const AnalyticsPeriod = z.enum(['7d', '30d', '90d']);
export const CabinetAnalytics = z.object({
  period: AnalyticsPeriod,
  series: z.array(
    z.object({ date: z.string(), impressions: z.number().int(), views: z.number().int(), contacts: z.number().int(), leads: z.number().int() }),
  ),
  sources: z.array(z.object({ source: z.enum(['search', 'map', 'seo', 'compare', 'direct']), share: z.number() })),
  hours: z.array(z.number()).length(24),
  queries: z.array(z.object({ query: z.string(), impressions: z.number().int(), ctr: z.number(), leads: z.number().int() })),
  competitors: z.object({ avgPriceIndex: z.number(), avgRating: z.number(), avgResponseMin: z.number() }),
});
export type CabinetAnalytics = z.infer<typeof CabinetAnalytics>;

export const CabinetOffer = z.object({
  serviceId: Id,
  enabled: z.boolean(),
  priceFrom: Rub,
  priceTo: Rub,
  durationMin: z.number().int().positive(),
  warrantyDays: z.number().int().nonnegative(),
  parts: z.array(PartsQuality),
  marketMedian: Rub,
});
export type CabinetOffer = z.infer<typeof CabinetOffer>;

export const UpdateOffers = z.object({
  offers: z.array(CabinetOffer.omit({ marketMedian: true })).max(100),
});

export const CabinetSchedule = z.object({
  schedule: WeeklySchedule,
  acceptingLeads: z.boolean(),
  vacation: z.object({ from: z.string(), to: z.string() }).nullable(),
  timezone: z.string(),
  zone: z.object({ center: GeoPoint, radiusKm: z.number().min(1).max(50), visitTypes: z.array(VisitType) }),
});
export type CabinetSchedule = z.infer<typeof CabinetSchedule>;

export const UpdateProfile = z.object({
  name: z.string().trim().min(2).max(120),
  tagline: z.string().trim().max(140),
  about: z.string().trim().max(3000),
  address: z.string().trim().max(200),
  telegram: z.string().trim().max(64).nullable(),
  brandIds: z.array(Id).min(1),
  visitTypes: z.array(VisitType).min(1),
  paymentMethods: z.array(PaymentMethod).min(1),
  partsQualities: z.array(PartsQuality),
  warrantyDays: z.number().int().min(0).max(730),
  express: z.boolean(),
});
export type UpdateProfile = z.infer<typeof UpdateProfile>;

export const CabinetTeam = z.object({
  staff: z.array(z.object({ id: Id, name: z.string(), role: StaffRole, experienceYears: z.number().int(), branchId: Id.nullable() })),
  branches: z.array(z.object({ id: Id, name: z.string(), address: z.string(), districtName: z.string() })),
  seats: z.object({ used: z.number().int(), limit: z.number().int() }),
});
export type CabinetTeam = z.infer<typeof CabinetTeam>;

export const InviteStaff = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().min(10).max(20),
  role: StaffRole.exclude(['owner']),
  branchId: Id.nullable(),
});

/** Платные возможности оплачиваются только по внешнему счёту — платёжного интерфейса на сайте нет. */
export const BillingProduct = z.enum(['pro_month', 'pro_year', 'promotion_week']);
export const Invoice = z.object({
  id: Id,
  number: z.string(),
  product: BillingProduct,
  amount: Rub,
  status: z.enum(['issued', 'paid', 'cancelled']),
  issuedAt: DateTime,
  payer: z.string(),
});
export type Invoice = z.infer<typeof Invoice>;
export const CabinetBilling = z.object({
  plan: Plan,
  planUntil: DateTime.nullable(),
  promotion: z.object({ active: z.boolean(), until: DateTime.nullable(), impressions: z.number().int() }),
  invoices: z.array(Invoice),
});
export type CabinetBilling = z.infer<typeof CabinetBilling>;
export const RequestInvoice = z.object({
  product: BillingProduct,
  payer: z.string().trim().min(2).max(200),
  inn: z.string().regex(/^\d{10}(\d{2})?$/, 'ИНН — 10 или 12 цифр'),
  email: z.email(),
});
export type RequestInvoice = z.infer<typeof RequestInvoice>;
