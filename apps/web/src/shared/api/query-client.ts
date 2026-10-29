import { defaultShouldDehydrateQuery, isServer, QueryClient } from '@tanstack/react-query';
import { isApiError } from './errors';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // Повторы сети делает apiCall; здесь — только для неожиданных ошибок
        retry: (failureCount, error) => !(isApiError(error) && error.status < 500) && failureCount < 1,
      },
      // Стриминг SSR: незавершённые запросы тоже передаются клиенту
      dehydrate: {
        shouldDehydrateQuery: (query) => defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
        shouldRedactErrors: () => false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/** На сервере — новый клиент на каждый запрос, в браузере — синглтон. */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
