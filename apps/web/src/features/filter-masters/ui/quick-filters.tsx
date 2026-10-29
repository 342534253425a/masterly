'use client';

import { BadgeCheck, Bike, Clock, LocateFixed, ShieldCheck, SlidersHorizontal, Sparkles, Star, Truck, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { cn, track } from '@/shared/lib';
import { Chip, toast } from '@/shared/ui';
import { activeFilterCount, type SearchFilters } from '../model/search-params';
import { useSearchFilters } from '../model/use-search-filters';

interface Quick {
  key: string;
  icon: ReactNode;
  label: string;
  active: boolean;
  patch: Partial<SearchFilters>;
}

/**
 * Быстрые фильтры над выдачей (как на Авито): самые частые условия — одним касанием, без открытия панели.
 * На телефоне ряд листается по горизонтали; «Все фильтры» открывает полную панель со счётчиком.
 */
export function QuickFilters({ onOpenAll, className }: { onOpenAll?: () => void; className?: string }) {
  const t = useTranslations('search');
  const { filters, setFilters } = useSearchFilters();
  const [locating, setLocating] = useState(false);
  const count = activeFilterCount(filters);

  const quick: Quick[] = [
    { key: 'open', icon: <Clock />, label: t('filters.openNow'), active: Boolean(filters.openNow), patch: { openNow: filters.openNow ? null : true } },
    { key: 'verified', icon: <BadgeCheck />, label: t('filters.verified'), active: Boolean(filters.verified), patch: { verified: filters.verified ? null : true } },
    { key: 'express', icon: <Zap />, label: t('filters.express'), active: Boolean(filters.express), patch: { express: filters.express ? null : true } },
    { key: 'rating', icon: <Star />, label: t('quick.rating'), active: filters.ratingMin === 4.5, patch: { ratingMin: filters.ratingMin === 4.5 ? null : 4.5 } },
    { key: 'warranty', icon: <ShieldCheck />, label: t('quick.warranty'), active: filters.warrantyMin === 90, patch: { warrantyMin: filters.warrantyMin === 90 ? null : 90 } },
    { key: 'onsite', icon: <Truck />, label: t('quick.onsite'), active: filters.visit === 'onsite', patch: { visit: filters.visit === 'onsite' ? null : 'onsite' } },
    { key: 'courier', icon: <Bike />, label: t('visit.courier'), active: filters.visit === 'courier', patch: { visit: filters.visit === 'courier' ? null : 'courier' } },
    { key: 'original', icon: <Sparkles />, label: t('quick.original'), active: filters.parts === 'original', patch: { parts: filters.parts === 'original' ? null : 'original' } },
  ];

  const near = filters.lat !== null;
  const locate = () => {
    if (near) return void setFilters({ lat: null, lng: null, radiusKm: null, sort: filters.sort === 'distance' ? 'relevance' : filters.sort });
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        void setFilters({ lat: Number(position.coords.latitude.toFixed(5)), lng: Number(position.coords.longitude.toFixed(5)), radiusKm: filters.radiusKm ?? 5, sort: 'distance' });
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
    <div className={cn('-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden', className)}>
      {onOpenAll ? (
        <Chip size="sm" active={count > 0} onClick={onOpenAll} className="font-semibold">
          <SlidersHorizontal />
          {t('quick.all')}
          {count ? <span className="rounded-full bg-brand px-1.5 text-[10px] leading-4 text-white">{count}</span> : null}
        </Chip>
      ) : null}
      <Chip size="sm" active={near} onClick={locate} disabled={locating} aria-busy={locating}>
        <LocateFixed className={cn(locating && 'animate-pulse')} />
        {t('filters.near')}
      </Chip>
      {quick.map((item) => (
        <Chip
          key={item.key}
          size="sm"
          active={item.active}
          onClick={() => {
            void setFilters(item.patch);
            track('quick_filter', { key: item.key, on: !item.active });
          }}
        >
          {item.icon}
          {item.label}
        </Chip>
      ))}
    </div>
  );
}
