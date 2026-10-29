import { createLoader, parseAsBoolean, parseAsFloat, parseAsInteger, parseAsString, parseAsStringLiteral, type inferParserType } from 'nuqs/server';
import type { SearchParams } from '@/entities/master';

/**
 * Состояние поиска живёт в URL: ссылкой можно поделиться, работают «назад/вперёд»,
 * а сервер рендерит ту же выдачу (одинаковые парсеры на сервере и клиенте).
 */
export const searchParsers = {
  q: parseAsString,
  city: parseAsString,
  service: parseAsString,
  model: parseAsString,
  brand: parseAsString,
  priceMax: parseAsInteger,
  ratingMin: parseAsFloat,
  warrantyMin: parseAsInteger,
  openNow: parseAsBoolean,
  verified: parseAsBoolean,
  express: parseAsBoolean,
  visit: parseAsStringLiteral(['workshop', 'onsite', 'courier'] as const),
  parts: parseAsStringLiteral(['original', 'oem', 'copy'] as const),
  sort: parseAsStringLiteral(['relevance', 'price', 'rating', 'distance', 'response'] as const).withDefault('relevance'),
  radiusKm: parseAsInteger,
  lat: parseAsFloat,
  lng: parseAsFloat,
  view: parseAsStringLiteral(['list', 'map'] as const).withDefault('list'),
};

export type SearchFilters = inferParserType<typeof searchParsers>;

export const loadSearchFilters = createLoader(searchParsers);

/** URL-состояние → параметры API (без UI-полей и пустых значений). */
export function toSearchParams(filters: SearchFilters, fallbackCity: string): SearchParams {
  const result: SearchParams = { city: filters.city ?? fallbackCity, sort: filters.sort };
  if (filters.q) result.q = filters.q;
  if (filters.service) result.service = filters.service;
  if (filters.model) result.model = filters.model;
  if (filters.brand) result.brand = filters.brand;
  if (filters.priceMax) result.priceMax = filters.priceMax;
  if (filters.ratingMin) result.ratingMin = filters.ratingMin;
  if (filters.warrantyMin) result.warrantyMin = filters.warrantyMin;
  if (filters.openNow) result.openNow = true;
  if (filters.verified) result.verified = true;
  if (filters.express) result.express = true;
  if (filters.visit) result.visit = filters.visit;
  if (filters.parts) result.parts = filters.parts;
  if (filters.lat !== null && filters.lng !== null) {
    result.lat = filters.lat;
    result.lng = filters.lng;
    result.radiusKm = filters.radiusKm ?? 10;
  }
  return result;
}

export function activeFilterCount(filters: SearchFilters): number {
  return [
    filters.service,
    filters.model,
    filters.brand,
    filters.priceMax,
    filters.ratingMin,
    filters.warrantyMin,
    filters.openNow,
    filters.verified,
    filters.express,
    filters.visit,
    filters.parts,
    filters.lat,
  ].filter((value) => value !== null && value !== false).length;
}
