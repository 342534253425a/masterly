'use client';

import type { Role, Session } from '@masterly/contracts';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { sessionQueries } from '@/entities/session';
import { apiCall } from '@/shared/api';
import { track } from '@/shared/lib';

/** После смены пользователя сбрасываем все приватные данные из кэша. */
function applySession(queryClient: QueryClient, session: Session) {
  queryClient.setQueryData(sessionQueries.current().queryKey, session);
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' && ['leads', 'conversations', 'favorites', 'notifications', 'cabinet', 'admin', 'settings'].includes(String(query.queryKey[0])) });
  void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
}

export function useDemoLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: Role) => apiCall('demoLogin', { body: { role } }),
    onSuccess: (session, role) => {
      applySession(queryClient, session);
      track('demo_login', { role });
    },
  });
}

export function useRequestOtp() {
  return useMutation({ mutationFn: (phone: string) => apiCall('otpRequest', { body: { phone } }) });
}

export function useVerifyOtp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { requestId: string; code: string }) => apiCall('otpVerify', { body: input }),
    onSuccess: (session) => {
      applySession(queryClient, session);
      track('login', { method: 'otp' });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiCall('logout', {}),
    onSuccess: () => applySession(queryClient, { user: null, demo: true }),
  });
}
