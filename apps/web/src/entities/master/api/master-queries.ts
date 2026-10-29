import type { SearchQuery } from '@masterly/contracts';
import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query';
import { apiCall } from '@/shared/api';

export type SearchParams = Partial<Omit<SearchQuery, 'cursor' | 'limit'>>;
export type ReviewFilters = { sort?: 'recent' | 'rating_desc' | 'rating_asc' | 'helpful'; rating?: number; withPhotos?: boolean };

export const masterQueries = {
  search: (params: SearchParams) =>
    infiniteQueryOptions({
      queryKey: ['masters', 'search', params],
      queryFn: ({ pageParam, signal }) => apiCall('search', { query: { ...params, cursor: pageParam, limit: 12 } }, { signal }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    }),

  map: (params: SearchParams) =>
    queryOptions({
      queryKey: ['masters', 'map', params],
      queryFn: ({ signal }) => apiCall('mapPins', { query: params }, { signal }),
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    }),

  suggest: (q: string, city?: string) =>
    queryOptions({
      queryKey: ['search', 'suggest', q, city ?? null],
      queryFn: ({ signal }) => apiCall('suggest', { query: { q, city } }, { signal }),
      placeholderData: keepPreviousData,
      staleTime: 60_000,
    }),

  detail: (slug: string, context: { service?: string; model?: string } = {}) =>
    queryOptions({
      queryKey: ['masters', 'detail', slug, context],
      queryFn: ({ signal }) => apiCall('master', { params: { slug }, query: context }, { signal }),
      staleTime: 60_000,
      // Смена модели в таблице цен не «мигает» профилем — показываем прошлые данные до ответа
      placeholderData: keepPreviousData,
    }),

  reviews: (id: string, filters: ReviewFilters = {}) =>
    infiniteQueryOptions({
      queryKey: ['masters', 'reviews', id, filters],
      queryFn: ({ pageParam, signal }) => apiCall('masterReviews', { params: { id }, query: { ...filters, cursor: pageParam, limit: 6 } }, { signal }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      placeholderData: keepPreviousData,
    }),

  similar: (id: string) =>
    queryOptions({
      queryKey: ['masters', 'similar', id],
      queryFn: ({ signal }) => apiCall('similarMasters', { params: { id } }, { signal }),
    }),

  compare: (ids: string[], service?: string, model?: string) =>
    queryOptions({
      queryKey: ['masters', 'compare', ids, service ?? null, model ?? null],
      queryFn: ({ signal }) => apiCall('compare', { query: { ids: ids.join(','), service, model } }, { signal }),
      enabled: ids.length > 0,
      placeholderData: keepPreviousData,
    }),

  landing: (city: string, service?: string, model?: string) =>
    queryOptions({
      queryKey: ['seo', 'landing', city, service ?? null, model ?? null],
      queryFn: ({ signal }) => apiCall('landing', { query: { city, service, model } }, { signal }),
      staleTime: 5 * 60_000,
    }),
};
