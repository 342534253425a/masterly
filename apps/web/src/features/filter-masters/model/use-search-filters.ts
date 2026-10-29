'use client';

import { useQueryStates } from 'nuqs';
import { useCurrentCity } from '@/entities/city';
import { searchParsers, toSearchParams } from './search-params';

export function useSearchFilters() {
  const [filters, setFilters] = useQueryStates(searchParsers, { history: 'replace', scroll: false });
  const { slug } = useCurrentCity();
  return { filters, setFilters, params: toSearchParams(filters, slug), city: filters.city ?? slug };
}
