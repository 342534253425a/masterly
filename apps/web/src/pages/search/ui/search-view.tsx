'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { List, Map as MapIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { MastersMap } from '@/widgets/masters-map';
import { SearchResults } from '@/widgets/search-results';
import { ActiveFilters, FiltersPanel, QuickFilters, SortSelect, useSearchFilters } from '@/features/filter-masters';
import { catalogQueries } from '@/entities/catalog';
import { cityQueries } from '@/entities/city';
import { masterQueries } from '@/entities/master';
import { cn } from '@/shared/lib';
import { useMediaQuery } from '@/shared/lib/hooks';
import { Button, Dialog, DialogContent, SegmentedControl } from '@/shared/ui';

/**
 * Страница выдачи — главный экран продукта. Два режима:
 * «Список» — фильтры, выдача и карта рядом (на телефоне карта открывается кнопкой);
 * «Карта» — большая карта и узкий список (на телефоне — полноэкранная карта с лентой карточек).
 */
export function SearchView() {
  const t = useTranslations('search');
  const { filters, setFilters, params, city } = useSearchFilters();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: cities } = useQuery(cityQueries.list());
  const { data: services } = useQuery(catalogQueries.services(city));
  // Тот же ключ, что у выдачи: кэш общий, отдельного запроса нет
  const results = useInfiniteQuery(masterQueries.search(params));
  const mobile = useMediaQuery('(max-width: 1023px)');
  const cityData = cities?.find((c) => c.slug === city);
  const first = results.data?.pages[0];
  const items = useMemo(() => results.data?.pages.flatMap((page) => page.items) ?? [], [results.data]);
  const serviceNames = useMemo(() => new Map(services?.map((service) => [service.id, service.name])), [services]);
  const isMap = filters.view === 'map';
  const setView = (view: 'list' | 'map') => void setFilters({ view });

  return (
    <div className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', isMap ? 'max-w-none pb-4 pt-4' : 'max-w-[1760px] pb-10 pt-5')}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold tracking-tight sm:text-[28px]">
            {t('title')} <span className="text-muted">{cityData?.nameIn}</span>
          </h1>
          {first ? (
            <p className="mt-0.5 text-sm text-muted">
              {t('found', { count: first.total })}
              <span className="ml-2 text-xs text-subtle">· {t('tookMs', { ms: first.tookMs })}</span>
            </p>
          ) : null}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <SortSelect className="max-sm:min-w-0 max-sm:flex-1" />
          {/* На телефоне режим переключают плавающая кнопка «Карта» и «Списком» на карте */}
          <SegmentedControl
            className="max-sm:hidden"
            size="sm"
            value={filters.view}
            onChange={setView}
            ariaLabel={t('view.list')}
            options={[
              { value: 'list', label: t('view.list'), icon: <List /> },
              { value: 'map', label: t('view.map'), icon: <MapIcon /> },
            ]}
          />
        </div>
      </div>

      <QuickFilters className="mt-3.5" onOpenAll={() => setSheetOpen(true)} />
      <ActiveFilters />

      {isMap ? (
        <div className="mt-3 grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)] xl:grid-cols-[440px_minmax(0,1fr)]">
          <section className="hidden h-[calc(100dvh-14rem)] min-h-[520px] overflow-y-auto overscroll-contain pr-1 lg:block" aria-label={t('view.list')}>
            <SearchResults compact />
          </section>
          <MastersMap
            params={params}
            city={city}
            items={items}
            serviceNames={serviceNames}
            expanded
            onToggleExpand={mobile ? undefined : () => setView('list')}
            carousel={mobile}
            onShowList={() => setView('list')}
            // Телефон: шапка выше, а снизу навигация приложения — карта заканчивается над ней
            className="h-[calc(100dvh-22rem)] min-h-[420px] max-lg:-mx-4 max-lg:rounded-none max-lg:border-x-0 lg:h-[calc(100dvh-13rem)] lg:min-h-[520px]"
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-5 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.82fr)] 2xl:grid-cols-[256px_minmax(0,1fr)_minmax(440px,0.78fr)]">
          {/* 1024–1279: фильтры + список; 1280–1535: список + карта (фильтры — чипами и в «Все фильтры»); от 1536 — все три колонки */}
          <aside className="hidden lg:block xl:hidden 2xl:block">
            <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-3xl border border-line bg-surface p-4">
              <FiltersPanel facets={first?.facets} />
            </div>
          </aside>
          <section className="min-w-0" aria-label={t('view.list')}>
            <SearchResults />
          </section>
          <div className="hidden xl:block">
            <div className="sticky top-20 h-[calc(100dvh-6.5rem)]">
              <MastersMap params={params} city={city} items={items} serviceNames={serviceNames} onToggleExpand={() => setView('map')} className="h-full" />
            </div>
          </div>
        </div>
      )}

      {/* Телефон и планшет: карта — плавающей кнопкой, как в приложениях объявлений */}
      {!isMap ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[6.5rem] z-30 lg:bottom-6 flex justify-center xl:hidden">
          <Button className="pointer-events-auto rounded-full shadow-glow" onClick={() => setView('map')}>
            <MapIcon />
            {t('view.map')}
          </Button>
        </div>
      ) : null}

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent
          title={t('filters.title')}
          footer={
            <Button className="w-full" size="lg" onClick={() => setSheetOpen(false)}>
              {t('filters.show', { count: first?.total ?? 0 })}
            </Button>
          }
        >
          <FiltersPanel facets={first?.facets} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
