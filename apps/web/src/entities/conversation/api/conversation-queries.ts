import { queryOptions } from '@tanstack/react-query';
import { apiCall, isRealtimeConnected } from '@/shared/api';

export const conversationQueries = {
  list: () =>
    queryOptions({
      queryKey: ['conversations'],
      queryFn: ({ signal }) => apiCall('conversations', {}, { signal }),
      refetchInterval: () => (isRealtimeConnected() ? 60_000 : 8_000),
    }),
  messages: (id: string) =>
    queryOptions({
      queryKey: ['conversations', id, 'messages'],
      queryFn: ({ signal }) => apiCall('messages', { params: { id } }, { signal }),
      // Живой режим: сигнал WebSocket messaging (Redis Pub/Sub между подами) инвалидирует запрос, опрос — редкая страховка.
      // Демо-режим и обрыв канала — частый опрос
      refetchInterval: () => (isRealtimeConnected() ? 30_000 : 2_500),
    }),
};
