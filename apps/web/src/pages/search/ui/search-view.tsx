'use client';

import type { Facets, SearchResponse } from '@masterly/contracts';
import { useQuery } from '@tanstack/react-query';
import { List, Map as MapIcon, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { MastersMap } from '@/widgets/masters-map';
import { SearchResults } from '@/widgets/search-results';
import { ActiveFilters, activeFilterCount, FiltersPanel, SortSelect, useSearchFilters } from '@/features/filter-masters';
import { cityQueries } from '@/entities/city';
import { cn } from '@/shared/lib';
import { Button, Dialog, DialogContent, SegmentedControl } from '@/shared/ui';

export function SearchView() {
  const t = useTranslations('search');
  const { filters, setFilters, params, city } = useSearchFilters();
  const [summary, setSummary] = useState<{ facets: Facets; total: number; tookMs: number } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: cities } = useQuery(cityQueries.list());
  const cityData = cities?.find((c) => c.slug === city);
  const filterCount = activeFilterCount(filters);
  const onFirstPage = useCallback((page: SearchResponse) => setSummary({ facets: page.facets, total: page.total, tookMs: page.tookMs }), []);

  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 pb-10 pt-5 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] font-extrabold tracking-tight sm:text-[28px]">
            {t('title')} <span className="text-muted">{cityData?.nameIn}</span>
          </h1>
          {summary ? (
            <p className="mt-0.5 text-sm text-muted">
              {t('found', { count: summary.total })}
              <span className="ml-2 text-xs text-subtle">· {t('tookMs', { ms: summary.tookMs })}</span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" className="rounded-full lg:hidden" onClick={() => setSheetOpen(true)}>
            <SlidersHorizontal />
            {t('filters.title')}
            {filterCount ? <span className="rounded-full bg-brand px-1.5 text-[10px] text-white">{filterCount}</span> : null}
          </Button>
          <SegmentedControl
            className="xl:hidden"
            size="sm"
            value={filters.view}
            onChange={(view) => void setFilters({ view })}
            options={[
              { value: 'list', label: t('view.list'), icon: <List /> },
              { value: 'map', label: t('view.map'), icon: <MapIcon /> },
            ]}
          />
          <SortSelect />
        </div>
      </div>
      <ActiveFilters />

      <div className="mt-4 grid gap-5 lg:grid-cols-[264px_minmax(0,1fr)] xl:grid-cols-[264px_minmax(0,1fr)_minmax(0,0.9fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-3xl border border-line bg-surface p-4">
            <FiltersPanel facets={summary?.facets} />
          </div>
        </aside>
        <section className={cn('min-w-0', filters.view === 'map' && 'max-xl:hidden')} aria-label={t('view.list')}>
          <SearchResults onFirstPage={onFirstPage} />
        </section>
        <div className={cn(filters.view === 'map' ? 'block' : 'hidden', 'xl:block')}>
          <div className="sticky top-20 h-[calc(100dvh-10rem)] lg:h-[calc(100dvh-6.5rem)]">
            <MastersMap params={params} city={city} className="h-full" />
          </div>
        </div>
      </div>

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent
          title={t('filters.title')}
          footer={
            <Button className="w-full" size="lg" onClick={() => setSheetOpen(false)}>
              {t('filters.show', { count: summary?.total ?? 0 })}
            </Button>
          }
        >
          <FiltersPanel facets={summary?.facets} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
