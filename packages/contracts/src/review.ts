import { z } from 'zod';
import { DateTime, Id, Ref } from './common.js';

export const Review = z.object({
  id: Id,
  masterId: Id,
  author: z.object({ name: z.string(), initials: z.string() }),
  rating: z.number().int().min(1).max(5),
  text: z.string(),
  service: Ref,
  model: Ref.nullable(),
  createdAt: DateTime,
  verified: z.boolean(),
  photos: z.number().int(),
  helpful: z.number().int(),
  reply: z.object({ text: z.string(), createdAt: DateTime }).nullable(),
});
export type Review = z.infer<typeof Review>;

export const ReviewSort = z.enum(['recent', 'rating_desc', 'rating_asc', 'helpful']);

export const ReviewsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  sort: ReviewSort.default('recent'),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  withPhotos: z.stringbool().optional(),
});

export const ReviewsPage = z.object({
  items: z.array(Review),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
  distribution: z.array(z.number().int()).length(5),
  rating: z.number(),
});
export type ReviewsPage = z.infer<typeof ReviewsPage>;

/** Отзыв можно оставить только по завершённой заявке — защита от накрутки на уровне модели данных. */
export const CreateReview = z.object({
  leadId: Id,
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(20, 'Расскажите чуть подробнее — минимум 20 символов').max(2000),
});
export type CreateReview = z.infer<typeof CreateReview>;

export const ReplyToReview = z.object({ text: z.string().trim().min(2).max(1000) });

export const ReportReason = z.enum(['spam', 'fake', 'offensive', 'fraud', 'wrong_info', 'other']);
export const CreateReport = z.object({
  subjectType: z.enum(['master', 'review', 'photo', 'message']),
  subjectId: Id,
  reason: ReportReason,
  note: z.string().max(1000).optional(),
});
export type CreateReport = z.infer<typeof CreateReport>;
