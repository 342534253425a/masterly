'use client';

import type { MasterCard as MasterCardData } from '@masterly/contracts';
import { Clock, MapPin, ShieldCheck, Zap } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { cn, formatDistance, formatDuration } from '@/shared/lib';
import { Badge, RatingValue, Skeleton } from '@/shared/ui';
import { useMasterHighlight } from '../model/highlight-store';
import { MasterAvatar, OpenStatus, PriceTag, PromotedLabel, VerifiedBadge, warrantyMonths } from './master-bits';

export interface MasterCardProps {
  master: MasterCardData;
  /** Подпись к цене: «Замена дисплея · iPhone 13». */
  priceCaption?: ReactNode;
  /** Слоты для фич: избранное, сравнение, заявка (FSD: сущность не знает о фичах). */
  topActions?: ReactNode;
  primaryAction?: ReactNode;
  hrefQuery?: Record<string, string | undefined>;
  className?: string;
}

export function MasterCard({ master, priceCaption, topActions, primaryAction, hrefQuery, className }: MasterCardProps) {
  const t = useTranslations();
  const locale = useLocale();
  const hover = useMasterHighlight((s) => s.hover);
  const highlighted = useMasterHighlight((s) => s.hoveredId === master.id || s.selectedId === master.id);

  return (
    <article
      onMouseEnter={() => hover(master.id)}
      onMouseLeave={() => hover(null)}
      className={cn(
        'group relative rounded-3xl border bg-surface p-4 shadow-card transition-[border-color,box-shadow,transform] duration-300 sm:p-5',
        highlighted ? 'border-accent/45 shadow-glow' : 'border-line hover:border-line-strong',
        master.promoted && 'bg-[linear-gradient(135deg,rgb(251_191_36/0.05),transparent_45%)]',
        className,
      )}
    >
      <Link href={routes.master(master.slug, hrefQuery)} className="absolute inset-0 z-0 rounded-3xl" aria-label={master.name} />
      <div className="pointer-events-none relative flex gap-4">
        <MasterAvatar master={master} size="lg" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="truncate text-[16px] font-bold leading-snug">{master.name}</h3>
                <span className="pointer-events-auto flex items-center gap-1.5">
                  {master.verified ? <VerifiedBadge verification={master.verification} compact /> : null}
                  {master.plan === 'pro' ? <Badge tone="accent" size="sm">PRO</Badge> : null}
                  {master.promoted ? <PromotedLabel promoted={master.promoted} /> : null}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{master.tagline}</p>
            </div>
            {topActions ? <div className="pointer-events-auto relative z-10 -mr-1 -mt-1 flex shrink-0 gap-0.5">{topActions}</div> : null}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
            <RatingValue rating={master.rating} count={master.reviewsCount} />
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />
              {t('master.response', { time: formatDuration(master.responseTimeMin, locale) })}
            </span>
            <span>{t('common.years', { count: master.experienceYears })}</span>
            {master.distanceKm !== null ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {formatDistance(master.distanceKm, locale)}
              </span>
            ) : null}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
            <OpenStatus state={master.openState} />
            <span className="truncate text-subtle">
              {master.districtName} · {master.landmark}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {master.visitTypes.map((visit) => (
              <Badge key={visit} size="sm">
                {t(`search.visit.${visit}`)}
              </Badge>
            ))}
            {master.express ? (
              <Badge tone="warning" size="sm">
                <Zap aria-hidden />
                {t('master.express')}
              </Badge>
            ) : null}
            {master.warrantyDays > 0 ? (
              <Badge tone="success" size="sm">
                <ShieldCheck aria-hidden />
                {t('common.warrantyMonths', { months: warrantyMonths(master.warrantyDays) })}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      {master.price || primaryAction ? (
        <div className="pointer-events-none relative mt-4 flex items-center justify-between gap-3 border-t border-line pt-3.5">
          <div className="min-w-0">
            {priceCaption ? <div className="truncate text-[12px] text-subtle">{priceCaption}</div> : null}
            {master.price ? <PriceTag range={master.price.range} /> : null}
          </div>
          {primaryAction ? <div className="pointer-events-auto relative z-10 flex shrink-0 items-center gap-2">{primaryAction}</div> : null}
        </div>
      ) : null}
    </article>
  );
}

export function MasterCardSkeleton() {
  return (
    <div className="rounded-3xl border border-line bg-surface p-5">
      <div className="flex gap-4">
        <Skeleton className="size-14 rounded-2xl" />
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-2/3" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </div>
      </div>
      <Skeleton className="mt-5 h-9 w-full" />
    </div>
  );
}
