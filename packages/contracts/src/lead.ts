import { z } from 'zod';
import { DateTime, Id, PriceRange, Ref } from './common.js';
import { MasterLite, VisitType } from './master.js';

/**
 * Жизненный цикл заявки. Платформа не участвует в расчётах:
 * заявка — это обращение к мастеру, а не заказ с оплатой.
 */
export const LeadStatus = z.enum(['new', 'viewed', 'responded', 'accepted', 'in_progress', 'completed', 'cancelled', 'declined', 'expired']);
export type LeadStatus = z.infer<typeof LeadStatus>;

export const Urgency = z.enum(['asap', 'today', 'this_week', 'flexible']);
export type Urgency = z.infer<typeof Urgency>;

export const ContactChannel = z.enum(['chat', 'call', 'telegram', 'whatsapp']);
export type ContactChannel = z.infer<typeof ContactChannel>;

export const CreateLead = z.object({
  masterIds: z.array(Id).max(5),
  /** Разослать подходящим мастерам рядом (до 5), если конкретные мастера не выбраны. */
  broadcast: z.boolean().default(false),
  cityId: Id,
  serviceId: Id,
  modelId: Id.nullable(),
  description: z.string().trim().min(10, 'Опишите проблему хотя бы в паре слов').max(2000),
  urgency: Urgency,
  visitType: VisitType,
  preferredChannel: ContactChannel,
  /** Номер виден мастеру только при явном согласии клиента. */
  sharePhone: z.boolean(),
  photoIds: z.array(Id).max(5).default([]),
});
export type CreateLead = z.input<typeof CreateLead>;

export const LeadResponse = z.object({
  id: Id,
  master: MasterLite,
  price: PriceRange.nullable(),
  message: z.string(),
  etaMin: z.number().int().nullable(),
  createdAt: DateTime,
  status: z.enum(['pending', 'accepted', 'declined']),
});
export type LeadResponse = z.infer<typeof LeadResponse>;

export const LeadEventType = z.enum(['created', 'sent', 'viewed', 'responded', 'accepted', 'started', 'completed', 'cancelled', 'reviewed']);
export const LeadEvent = z.object({
  type: LeadEventType,
  at: DateTime,
  actor: z.enum(['client', 'master', 'system']),
  note: z.string().nullable(),
});
export type LeadEvent = z.infer<typeof LeadEvent>;

export const LeadSummary = z.object({
  id: Id,
  number: z.string(),
  status: LeadStatus,
  service: Ref,
  model: Ref.nullable(),
  createdAt: DateTime,
  updatedAt: DateTime,
  recipientsCount: z.number().int(),
  responsesCount: z.number().int(),
  bestPrice: PriceRange.nullable(),
  master: MasterLite.nullable(),
});
export type LeadSummary = z.infer<typeof LeadSummary>;

export const Lead = LeadSummary.extend({
  description: z.string(),
  urgency: Urgency,
  visitType: VisitType,
  preferredChannel: ContactChannel,
  sharePhone: z.boolean(),
  cityId: Id,
  recipients: z.array(z.object({ master: MasterLite, status: LeadStatus, viewedAt: DateTime.nullable() })),
  responses: z.array(LeadResponse),
  timeline: z.array(LeadEvent),
  conversationId: Id.nullable(),
  canReview: z.boolean(),
  reviewId: Id.nullable(),
});
export type Lead = z.infer<typeof Lead>;

/** Заявка глазами мастера: контакты клиента скрыты, пока он не дал согласие. */
export const CabinetLead = z.object({
  id: Id,
  number: z.string(),
  status: LeadStatus,
  createdAt: DateTime,
  expiresAt: DateTime,
  client: z.object({ name: z.string(), initials: z.string(), phone: z.string().nullable(), leadsCount: z.number().int() }),
  service: Ref,
  model: Ref.nullable(),
  description: z.string(),
  urgency: Urgency,
  visitType: VisitType,
  distanceKm: z.number().nullable(),
  myResponse: LeadResponse.nullable(),
  competitors: z.number().int(),
  conversationId: Id.nullable(),
});
export type CabinetLead = z.infer<typeof CabinetLead>;

export const RespondToLead = z.object({
  priceFrom: z.number().int().nonnegative(),
  priceTo: z.number().int().nonnegative().nullable(),
  message: z.string().trim().min(5).max(1000),
  etaMin: z.number().int().positive().nullable(),
});
export type RespondToLead = z.infer<typeof RespondToLead>;
