'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { conversationQueries } from '@/entities/conversation';
import { leadQueries } from '@/entities/lead';
import { cabinetQueries } from '@/entities/master';
import { notificationQueries } from '@/entities/notification';
import { sessionQueries, useSession } from '@/entities/session';
import { connectRealtime, isRealtimeConnected, subscribeRealtimeStatus } from '@/shared/api';

/**
 * Живой канал (только живой режим и только после входа): сигнал о сообщении инвалидирует нужные запросы,
 * данные приходят обычным путём через шлюз. Системные сообщения чата — это события заявки: обновляем и заявки.
 */
export function RealtimeSync({ url }: { url: string | null }) {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useSession();

  useEffect(() => {
    if (!url || !isAuthenticated) return;
    const refresh = (keys: ReadonlyArray<readonly unknown[]>) => keys.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey }));
    const resync = () => refresh([conversationQueries.list().queryKey, notificationQueries.list().queryKey]);
    const disconnect = connectRealtime(url, {
      onSignal: (signal) => {
        refresh([conversationQueries.list().queryKey, conversationQueries.messages(signal.conversationId).queryKey, notificationQueries.list().queryKey]);
        if (signal.kind === 'system') refresh([leadQueries.list().queryKey, cabinetQueries.leads().queryKey]);
      },
      onReady: resync,
      onExpired: () => queryClient.fetchQuery({ ...sessionQueries.current(), staleTime: 0 }),
    });
    // Канал оборвался — запросы сразу возвращаются к частому опросу, не дожидаясь редкого интервала
    const unsubscribe = subscribeRealtimeStatus(() => {
      if (!isRealtimeConnected()) resync();
    });
    return () => {
      unsubscribe();
      disconnect();
    };
  }, [url, isAuthenticated, queryClient]);

  return null;
}
