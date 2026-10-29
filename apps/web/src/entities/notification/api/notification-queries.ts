import { queryOptions } from '@tanstack/react-query';
import { apiCall } from '@/shared/api';

export const notificationQueries = {
  list: () =>
    queryOptions({
      queryKey: ['notifications'],
      queryFn: ({ signal }) => apiCall('notifications', {}, { signal }),
      refetchInterval: 20_000,
    }),
};
