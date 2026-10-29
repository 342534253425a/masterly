'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cityQueries, useCurrentCity } from '@/entities/city';
import { useSession } from '@/entities/session';
import { apiCall } from '@/shared/api';
import { cn, track } from '@/shared/lib';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/shared/ui';

export function CitySelect({ className, compact }: { className?: string; compact?: boolean }) {
  const t = useTranslations('city');
  const tCommon = useTranslations('common');
  const { slug, setCity } = useCurrentCity();
  const { isAuthenticated } = useSession();
  const router = useRouter();
  const { data: cities } = useQuery(cityQueries.list());
  const current = cities?.find((city) => city.slug === slug);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface-2/60 pl-3 pr-2.5 text-sm font-semibold text-fg backdrop-blur transition hover:border-line-strong',
          className,
        )}
        aria-label={t('choose')}
      >
        <MapPin className="size-4 text-accent dark:text-accent-2" aria-hidden />
        <span className={cn('truncate', compact && 'max-w-24')}>{current?.name ?? '…'}</span>
        <ChevronDown className="size-4 text-subtle" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{t('choose')}</DropdownMenuLabel>
        {cities?.map((city) => (
          <DropdownMenuItem
            key={city.id}
            onSelect={() => {
              setCity(city.slug);
              track('city_change', { city: city.slug });
              if (isAuthenticated) void apiCall('updateSettings', { body: { cityId: city.id } }).catch(() => {});
              router.refresh();
            }}
            className={cn(city.slug === slug && 'bg-accent-soft')}
          >
            <MapPin />
            <span className="flex-1">{city.name}</span>
            <span className="text-xs text-subtle">{tCommon('masters', { count: city.mastersCount })}</span>
          </DropdownMenuItem>
        ))}
        <p className="px-2.5 pb-1.5 pt-2 text-[11px] text-subtle">{t('mvpNote')}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
