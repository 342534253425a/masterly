import { z } from 'zod';
import { GeoPoint, Id, Ref, Rub, Slug } from './common.js';
import { MasterCard, PartsQuality, VisitType } from './master.js';

export const SearchSort = z.enum(['relevance', 'price', 'rating', 'distance', 'response']);
export type SearchSort = z.infer<typeof SearchSort>;

export const SearchQuery = z.object({
  q: z.string().trim().max(200).optional(),
  city: z.string().max(64).optional(),
  service: z.string().max(64).optional(),
  model: z.string().max(64).optional(),
  brand: z.string().max(64).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(50).optional(),
  priceMax: z.coerce.number().int().positive().optional(),
  ratingMin: z.coerce.number().min(0).max(5).optional(),
  warrantyMin: z.coerce.number().int().min(0).optional(),
  openNow: z.stringbool().optional(),
  verified: z.stringbool().optional(),
  express: z.stringbool().optional(),
  visit: VisitType.optional(),
  parts: PartsQuality.optional(),
  sort: SearchSort.default('relevance'),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchQuery = z.output<typeof SearchQuery>;

/** Как платформа поняла запрос «разбил экран айфон 13» — показываем пользователю прозрачно. */
export const Interpretation = z.object({
  query: z.string(),
  services: z.array(z.object({ id: Id, name: z.string(), slug: Slug, score: z.number() })),
  brand: Ref.nullable(),
  model: Ref.nullable(),
  urgent: z.boolean(),
  confidence: z.number().min(0).max(1),
  matchedTerms: z.array(z.string()),
  priceHint: z.object({ from: Rub, median: Rub, to: Rub, mastersCount: z.number().int() }).nullable(),
});
export type Interpretation = z.infer<typeof Interpretation>;

export const Facets = z.object({
  services: z.array(z.object({ id: Id, count: z.number().int() })),
  districts: z.array(z.object({ id: Id, name: z.string(), count: z.number().int() })),
  priceHistogram: z.array(z.object({ from: Rub, to: Rub, count: z.number().int() })),
});
export type Facets = z.infer<typeof Facets>;

export const SearchResponse = z.object({
  searchId: Id,
  items: z.array(MasterCard),
  total: z.number().int(),
  nextCursor: z.string().nullable(),
  interpretation: Interpretation.nullable(),
  facets: Facets,
  tookMs: z.number(),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

export const SuggestionType = z.enum(['problem', 'service', 'model', 'master', 'recent']);
export const Suggestion = z.object({
  type: SuggestionType,
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  query: z.record(z.string(), z.string()),
});
export type Suggestion = z.infer<typeof Suggestion>;

export const SuggestResponse = z.object({
  suggestions: z.array(Suggestion),
  interpretation: Interpretation.nullable(),
});
export type SuggestResponse = z.infer<typeof SuggestResponse>;

export const MapPin = z.object({
  id: Id,
  slug: Slug,
  name: z.string(),
  location: GeoPoint,
  rating: z.number(),
  price: Rub.nullable(),
  promoted: z.boolean(),
});
export type MapPin = z.infer<typeof MapPin>;

export const MapResponse = z.object({ pins: z.array(MapPin), total: z.number().int() });
export type MapResponse = z.infer<typeof MapResponse>;
