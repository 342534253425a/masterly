'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpDown, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { catalogQueries } from '@/entities/catalog';
import { formatPrice } from '@/shared/lib';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui';
import type { SearchFilters } from '../model/search-params';
import { useSearchFilters } from '../model/use-search-filters';

const SORTS = ['relevance', 'price', 'rating', 'distance', 'response'] as const;

export function SortSelect() {
  const t = useTranslations('search.sort');
  const { filters, setFilters } = useSearchFilters();
  return (
    <Select value={filters.sort} onValueChange={(value) => void setFilters({ sort: value as SearchFilters['sort'] })}>
      <SelectTrigger className="h-9 w-auto min-w-48 rounded-full" aria-label={t('label')}>
        <ArrowUpDown className="size-3.5 text-subtle" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {SORTS.map((sort) => (
          <SelectItem key={sort} value={sort}>
            {t(sort)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Чипы активных фильтров с быстрым удалением. */
export function ActiveFilters() {
  const t = useTranslations('search');
  const locale = useLocale();
  const { filters, setFilters, city } = useSearchFilters();
  const { data: services } = useQuery(catalogQueries.services(city));
  const { data: brands } = useQuery(catalogQueries.brands());
  const chips: Array<{ key: string; label: string; clear: Partial<Record<keyof SearchFilters, null>> }> = [];
  if (filters.service) chips.push({ key: 'service', label: services?.find((s) => s.slug === filters.service)?.name ?? filters.service, clear: { service: null } });
  if (filters.brand) chips.push({ key: 'brand', label: brands?.find((b) => b.id === filters.brand)?.name ?? filters.brand, clear: { brand: null, model: null } });
  if (filters.model) chips.push({ key: 'model', label: filters.model, clear: { model: null } });
  if (filters.priceMax) chips.push({ key: 'price', label: `≤ ${formatPrice(filters.priceMax, locale)}`, clear: { priceMax: null } });
  if (filters.ratingMin) chips.push({ key: 'rating', label: t('filters.ratingFrom', { value: filters.ratingMin.toFixed(1) }), clear: { ratingMin: null } });
  if (filters.warrantyMin) chips.push({ key: 'warranty', label: `${t('filters.warranty')} ${filters.warrantyMin} дн.`, clear: { warrantyMin: null } });
  if (filters.openNow) chips.push({ key: 'open', label: t('filters.openNow'), clear: { openNow: null } });
  if (filters.verified) chips.push({ key: 'verified', label: t('filters.verified'), clear: { verified: null } });
  if (filters.express) chips.push({ key: 'express', label: t('filters.express'), clear: { express: null } });
  if (filters.visit) chips.push({ key: 'visit', label: t(`visit.${filters.visit}`), clear: { visit: null } });
  if (filters.parts) chips.push({ key: 'parts', label: t(`parts.${filters.parts}`), clear: { parts: null } });
  if (filters.lat !== null) chips.push({ key: 'geo', label: `${t('filters.near')} · ${filters.radiusKm ?? 10} км`, clear: { lat: null, lng: null, radiusKm: null } });
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => void setFilters(chip.clear)}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-accent/30 bg-accent-soft pl-2.5 pr-1.5 text-xs font-semibold text-fg transition hover:border-accent/60"
        >
          {chip.label}
          <X className="size-3.5 text-muted" aria-label={t('filters.reset')} />
        </button>
      ))}
    </div>
  );
}
