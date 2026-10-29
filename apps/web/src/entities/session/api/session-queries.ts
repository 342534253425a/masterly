import { queryOptions } from '@tanstack/react-query';
import { apiCall } from '@/shared/api';

export const sessionQueries = {
  current: () =>
    queryOptions({
      queryKey: ['session'],
      queryFn: ({ signal }) => apiCall('session', {}, { signal, withCookies: true }),
      staleTime: 5 * 60_000,
    }),
};
