'use client';

import type { Role, User } from '@masterly/contracts';
import { useQuery } from '@tanstack/react-query';
import { sessionQueries } from '../api/session-queries';

export interface SessionState {
  user: User | null;
  role: Role | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isDemo: boolean;
}

export function useSession(): SessionState {
  const { data, isPending } = useQuery(sessionQueries.current());
  const user = data?.user ?? null;
  return { user, role: user?.activeRole ?? null, isAuthenticated: Boolean(user), isLoading: isPending, isDemo: data?.demo ?? false };
}
