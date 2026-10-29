import { queryOptions } from '@tanstack/react-query';
import { apiCall } from '@/shared/api';

export const cityQueries = {
  list: () =>
    queryOptions({
      queryKey: ['cities'],
      queryFn: ({ signal }) => apiCall('cities', {}, { signal }),
      staleTime: Infinity,
    }),
};
