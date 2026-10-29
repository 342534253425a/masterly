import { queryOptions } from '@tanstack/react-query';
import { apiCall } from '@/shared/api';

/** Данные кабинета мастера (read-модели из сервисов catalog, leads, reviews и analytics). */
export const cabinetQueries = {
  overview: () => queryOptions({ queryKey: ['cabinet', 'overview'], queryFn: ({ signal }) => apiCall('cabinetOverview', {}, { signal }) }),
  analytics: (period: '7d' | '30d' | '90d') =>
    queryOptions({ queryKey: ['cabinet', 'analytics', period], queryFn: ({ signal }) => apiCall('cabinetAnalytics', { query: { period } }, { signal }) }),
  profile: () => queryOptions({ queryKey: ['cabinet', 'profile'], queryFn: ({ signal }) => apiCall('cabinetProfile', {}, { signal }) }),
  offers: () => queryOptions({ queryKey: ['cabinet', 'offers'], queryFn: ({ signal }) => apiCall('cabinetOffers', {}, { signal }) }),
  schedule: () => queryOptions({ queryKey: ['cabinet', 'schedule'], queryFn: ({ signal }) => apiCall('cabinetSchedule', {}, { signal }) }),
  leads: () =>
    queryOptions({
      queryKey: ['cabinet', 'leads'],
      queryFn: ({ signal }) => apiCall('cabinetLeads', {}, { signal }),
      // Новые заявки приходят и в чат (системное сообщение) — живой канал обновляет список сразу; опрос — страховка
      refetchInterval: 10_000,
    }),
  reviews: () => queryOptions({ queryKey: ['cabinet', 'reviews'], queryFn: ({ signal }) => apiCall('cabinetReviews', {}, { signal }) }),
  team: () => queryOptions({ queryKey: ['cabinet', 'team'], queryFn: ({ signal }) => apiCall('cabinetTeam', {}, { signal }) }),
  billing: () => queryOptions({ queryKey: ['cabinet', 'billing'], queryFn: ({ signal }) => apiCall('cabinetBilling', {}, { signal }) }),
};
