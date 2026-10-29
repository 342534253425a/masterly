import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { apiCall } from '@/shared/api';

/** Read-модели админ-панели: агрегаты ClickHouse и каталог. */
export const platformQueries = {
  overview: () => queryOptions({ queryKey: ['admin', 'overview'], queryFn: ({ signal }) => apiCall('adminOverview', {}, { signal }), refetchInterval: 30_000 }),
  services: () => queryOptions({ queryKey: ['admin', 'services'], queryFn: ({ signal }) => apiCall('adminServices', {}, { signal }) }),
  categories: () => queryOptions({ queryKey: ['admin', 'categories'], queryFn: ({ signal }) => apiCall('adminCategories', {}, { signal }) }),
  searchGaps: () => queryOptions({ queryKey: ['admin', 'gaps'], queryFn: ({ signal }) => apiCall('searchGaps', {}, { signal }) }),
  prices: () => queryOptions({ queryKey: ['admin', 'prices'], queryFn: ({ signal }) => apiCall('priceStats', {}, { signal }) }),
  users: (q: string) =>
    queryOptions({
      queryKey: ['admin', 'users', q],
      queryFn: ({ signal }) => apiCall('adminUsers', { query: { q: q || undefined } }, { signal }),
      placeholderData: keepPreviousData,
    }),
};
