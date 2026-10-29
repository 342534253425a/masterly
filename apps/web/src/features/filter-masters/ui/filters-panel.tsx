'use client';

import type { Facets } from '@masterly/contracts';
import { useQuery } from '@tanstack/react-query';
import { LocateFixed, RotateCcw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { catalogQueries } from '@/entities/catalog';
import { cn, formatPrice, track } from '@/shared/lib';
import { Button, Chip, DynamicIcon, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider, Switch, toast } from '@/shared/ui';
import { activeFilterCount } from '../model/search-params';
import { useSearchFilters } from '../model/use-search-filters';

function Section({ title, children, aside }: { title: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-line py-4 first:pt-0 last:border-none">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[13px] font-bold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Панель фильтров: все значения пишутся в URL, выдача и карта обновляются без перезагрузки. */
export function FiltersPanel({ facets, className }: { facets?: Facets; className?: string }) {
  const t = useTranslations('search');
  const locale = useLocale();
  const { filters, setFilters, city } = useSearchFilters();
  const { data: services } = useQuery(catalogQueries.services(city));
  const { data: brands } = useQuery(catalogQueries.brands());
  const { data: models } = useQuery({ ...catalogQueries.models(filters.brand ?? undefined), enabled: Boolean(filters.brand) });
  const [locating, setLocating] = useState(false);
  const counts = new Map(facets?.services.map((s) => [s.id, s.count]));
  const histogram = facets?.priceHistogram ?? [];
  const maxPrice = Math.max(5000, ...histogram.map((b) => b.to));
  const maxCount = Math.max(1, ...histogram.map((b) => b.count));

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        void setFilters({ lat: Number(position.coords.latitude.toFixed(5)), lng: Number(position.coords.longitude.toFixed(5)), radiusKm: filters.radiusKm ?? 10, sort: 'distance' });
        toast.success(t('filters.nearOn'));
        track('geo_search', {});
      },
      () => {
        setLocating(false);
        toast.error(t('filters.geoDenied'));
      },
      { timeout: 8000, maximumAge: 300_000 },
    );
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <Section
        title={t('filters.service')}
        aside={
          activeFilterCount(filters) > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() =>
                void setFilters({ service: null, model: null, brand: null, priceMax: null, ratingMin: null, warrantyMin: null, openNow: null, verified: null, express: null, visit: null, parts: null, lat: null, lng: null, radiusKm: null })
              }
            >
              <RotateCcw />
              {t('filters.reset')}
            </Button>
          ) : null
        }
      >
        <div className="flex flex-col gap-1">
          {services?.map((service) => {
            const active = filters.service === service.slug;
            const count = counts.get(service.id);
            return (
              <button
                key={service.id}
                type="button"
                aria-pressed={active}
                onClick={() => void setFilters({ service: active ? null : service.slug })}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors',
                  active ? 'bg-accent-soft font-semibold text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                <DynamicIcon name={service.icon} className={cn('size-4 shrink-0', active ? 'text-accent' : 'text-subtle')} />
                <span className="flex-1 truncate">{service.name}</span>
                {count !== undefined ? <span className="text-[11px] tabular-nums text-subtle">{count}</span> : null}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={t('filters.brand')}>
        <div className="flex flex-wrap gap-1.5">
          {brands?.map((brand) => (
            <Chip key={brand.id} size="sm" active={filters.brand === brand.id} onClick={() => void setFilters({ brand: filters.brand === brand.id ? null : brand.id, model: null })}>
              {brand.name}
            </Chip>
          ))}
        </div>
        {filters.brand && models ? (
          <Select value={filters.model ?? 'any'} onValueChange={(value) => void setFilters({ model: value === 'any' ? null : value })}>
            <SelectTrigger className="mt-3" aria-label={t('filters.model')}>
              <SelectValue placeholder={t('filters.anyModel')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t('filters.anyModel')}</SelectItem>
              {models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </Section>

      {histogram.length > 0 ? (
        <Section title={t('filters.price')} aside={<span className="text-xs font-semibold text-accent dark:text-accent-2">{filters.priceMax ? formatPrice(filters.priceMax, locale) : '—'}</span>}>
          <div className="mb-1.5 flex h-10 items-end gap-0.5" aria-hidden>
            {histogram.map((bucket) => (
              <span
                key={bucket.from}
                className={cn('flex-1 rounded-t-sm transition-colors', !filters.priceMax || bucket.from <= filters.priceMax ? 'bg-accent/60' : 'bg-surface-3')}
                style={{ height: `${Math.max(8, (bucket.count / maxCount) * 100)}%` }}
              />
            ))}
          </div>
          <Slider
            min={0}
            max={maxPrice}
            step={500}
            value={[filters.priceMax ?? maxPrice]}
            onValueCommit={([value]) => void setFilters({ priceMax: value && value < maxPrice ? value : null })}
            aria-label={t('filters.price')}
          />
        </Section>
      ) : null}

      <Section title={t('filters.rating')}>
        <div className="flex flex-wrap gap-1.5">
          {[4, 4.5, 4.8].map((value) => (
            <Chip key={value} size="sm" active={filters.ratingMin === value} onClick={() => void setFilters({ ratingMin: filters.ratingMin === value ? null : value })}>
              {t('filters.ratingFrom', { value: value.toFixed(1) })}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title={t('filters.warranty')}>
        <div className="flex flex-wrap gap-1.5">
          {[90, 180, 365].map((days) => (
            <Chip key={days} size="sm" active={filters.warrantyMin === days} onClick={() => void setFilters({ warrantyMin: filters.warrantyMin === days ? null : days })}>
              {days >= 365 ? '1 год' : `${days / 30} мес.`}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title={t('filters.visit')}>
        <div className="flex flex-wrap gap-1.5">
          {(['workshop', 'courier', 'onsite'] as const).map((visit) => (
            <Chip key={visit} size="sm" active={filters.visit === visit} onClick={() => void setFilters({ visit: filters.visit === visit ? null : visit })}>
              {t(`visit.${visit}`)}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title={t('filters.parts')}>
        <div className="flex flex-wrap gap-1.5">
          {(['original', 'oem', 'copy'] as const).map((parts) => (
            <Chip key={parts} size="sm" active={filters.parts === parts} onClick={() => void setFilters({ parts: filters.parts === parts ? null : parts })}>
              {t(`parts.${parts}`)}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title={t('filters.radius')}>
        <Button variant={filters.lat !== null ? 'soft' : 'secondary'} size="sm" className="w-full" loading={locating} onClick={locate}>
          <LocateFixed />
          {filters.lat !== null ? t('filters.nearOn') : t('filters.near')}
        </Button>
        {filters.lat !== null ? (
          <div className="mt-3">
            <div className="mb-2 text-xs text-muted">{filters.radiusKm ?? 10} км</div>
            <Slider min={1} max={25} step={1} value={[filters.radiusKm ?? 10]} onValueCommit={([value]) => void setFilters({ radiusKm: value ?? 10 })} aria-label={t('filters.radius')} />
          </div>
        ) : null}
      </Section>

      <Section title={t('filters.title')}>
        <div className="flex flex-col divide-y divide-line">
          {(['openNow', 'verified', 'express'] as const).map((key) => (
            <label key={key} className="flex items-center justify-between py-2 text-[13px] font-medium">
              {t(`filters.${key}`)}
              <Switch checked={Boolean(filters[key])} onCheckedChange={(checked) => void setFilters({ [key]: checked || null })} />
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}
