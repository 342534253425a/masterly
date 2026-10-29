import { queryOptions } from '@tanstack/react-query';
import { apiCall } from '@/shared/api';

export const catalogQueries = {
  services: (city?: string) =>
    queryOptions({
      queryKey: ['catalog', 'services', city ?? null],
      queryFn: ({ signal }) => apiCall('services', { query: { city } }, { signal }),
      staleTime: 10 * 60_000,
    }),
  categories: () =>
    queryOptions({
      queryKey: ['catalog', 'categories'],
      queryFn: ({ signal }) => apiCall('categories', {}, { signal }),
      staleTime: 30 * 60_000,
    }),
  brands: () =>
    queryOptions({
      queryKey: ['catalog', 'brands'],
      queryFn: ({ signal }) => apiCall('brands', {}, { signal }),
      staleTime: Infinity,
    }),
  models: (brand?: string, q?: string) =>
    queryOptions({
      queryKey: ['catalog', 'models', brand ?? null, q ?? ''],
      queryFn: ({ signal }) => apiCall('models', { query: { brand, q: q || undefined } }, { signal }),
      staleTime: Infinity,
    }),
};
