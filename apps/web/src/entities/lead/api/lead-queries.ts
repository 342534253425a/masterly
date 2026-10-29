import { queryOptions } from '@tanstack/react-query';
import { apiCall } from '@/shared/api';

export const leadQueries = {
  list: () =>
    queryOptions({
      queryKey: ['leads'],
      queryFn: ({ signal }) => apiCall('leads', {}, { signal }),
      refetchInterval: 15_000,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: ['leads', id],
      queryFn: ({ signal }) => apiCall('lead', { params: { id } }, { signal }),
      // Ответ мастера — системное сообщение в чате: живой канал инвалидирует заявки сразу, опрос — страховка
      refetchInterval: 5_000,
    }),
};
