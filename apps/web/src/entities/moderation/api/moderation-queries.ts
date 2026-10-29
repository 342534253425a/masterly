import { queryOptions } from '@tanstack/react-query';
import { apiCall } from '@/shared/api';

export type ModerationKind = 'review' | 'profile' | 'photo' | 'description';
export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'escalated';

export const moderationQueries = {
  queue: (kind: ModerationKind | undefined, status: ModerationStatus) =>
    queryOptions({
      queryKey: ['admin', 'moderation', kind ?? 'all', status],
      queryFn: ({ signal }) => apiCall('moderationQueue', { query: { kind, status } }, { signal }),
    }),
  duplicates: () =>
    queryOptions({
      queryKey: ['admin', 'duplicates'],
      queryFn: ({ signal }) => apiCall('duplicates', {}, { signal }),
    }),
};
