'use client';

import type { MasterCard as MasterCardData } from '@masterly/contracts';
import { Clock, MapPin, ShieldCheck, Wrench, Zap } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { routes } from '@/shared/config';
import { Link, useRouter } from '@/shared/i18n';
import { cn, formatDistance, formatDuration, formatPrice } from '@/shared/lib';
import { Badge, RatingValue, Skeleton } from '@/shared/ui';
import { useMasterHighlight } from '../model/highlight-store';
import { MasterGallery } from './master-gallery';
import { OpenStatus, PriceTag, PromotedLabel, VerifiedBadge, warrantyMonths } from './master-bits';

export interface MasterCardProps {
  master: MasterCardData;
  /** Подпись к цене: «Замена дисплея · iPhone 13». */
  priceCaption?: ReactNode;
  /** Названия услуг для превью цен «Замена дисплея от 4 500 ₽» (справочник знает виджет, не сущность). */
  serviceNames?: ReadonlyMap<string, string>;
  /** Слоты для фич (FSD: сущность не знает о фичах): на фото — избранное, у названия — сравнение, внизу — связь и заявка. */
  mediaActions?: ReactNode;
  topActions?: ReactNode;
  primaryAction?: ReactNode;
  hrefQuery?: Record<string, string | undefined>;
  /** row — строка выдачи с галереей; compact — мини-карточка на карте и в ленте на телефоне. */
  variant?: 'row' | 'compact';
  className?: string;
}

function PriceBlock({ master, priceCaption, serviceNames, compact }: Pick<MasterCardProps, 'master' | 'priceCaption' | 'serviceNames'> & { compact?: boolean }) {
  const t = useTranslations('common');
  const locale = useLocale();
  if (master.price) {
    return (
      <div className="min-w-0">
        <PriceTag range={master.price.range} size={compact ? 'md' : 'lg'} />
        {priceCaption ? <div className="truncate text-[12px] text-subtle">{priceCaption}</div> : null}
      </div>
    );
  }
  const preview = master.offersPreview.slice(0, compact ? 1 : 3);
  if (preview.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
      {preview.map((offer, index) => (
        <span key={offer.serviceId} className={cn('whitespace-nowrap', index === 0 ? 'text-[17px] font-extrabold tracking-tight' : 'text-[13px] text-muted')}>
          {serviceNames?.get(offer.serviceId) ? <span className={cn(index === 0 && 'text-[13px] font-semibold text-muted')}>{serviceNames.get(offer.serviceId)} </span> : null}
          {t('priceFrom', { price: formatPrice(offer.priceFrom, locale) })}
        </span>
      ))}
    </div>
  );
}

function Meta({ master, compact }: { master: MasterCardData; compact?: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
      <RatingValue rating={master.rating} count={t('common.reviews', { count: master.reviewsCount })} />
      <span className="inline-flex items-center gap-1">
        <Clock className="size-3.5" aria-hidden />
        {t('master.response', { time: formatDuration(master.responseTimeMin, locale) })}
      </span>
      {!compact ? (
        <span className="inline-flex items-center gap-1">
          <Wrench className="size-3.5" aria-hidden />
          {t('common.orders', { count: master.completedOrders })}
        </span>
      ) : null}
      {master.distanceKm !== null ? (
        <span className="inline-flex items-center gap-1 font-medium text-fg">
          <MapPin className="size-3.5 text-accent" aria-hidden />
          {formatDistance(master.distanceKm, locale)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Карточка мастера в выдаче (по мотивам Авито): галерея работ слева, справа — цена крупно, рейтинг и отзывы,
 * скорость ответа, адрес и режим работы, преимущества, кнопки связи. Наведение подсвечивает пин на карте.
 */
export function MasterCard({ master, priceCaption, serviceNames, mediaActions, topActions, primaryAction, hrefQuery, variant = 'row', className }: MasterCardProps) {
  const t = useTranslations();
  const hover = useMasterHighlight((s) => s.hover);
  const highlighted = useMasterHighlight((s) => s.hoveredId === master.id || s.selectedId === master.id);
  const router = useRouter();
  const compact = variant === 'compact';
  const href = routes.master(master.slug, hrefQuery);

  const labels = (
    <div className="absolute left-2 top-2 flex flex-wrap gap-1">
      {master.plan === 'pro' ? <Badge tone="accent" size="sm" className="bg-brand text-white">PRO</Badge> : null}
      {master.promoted ? <PromotedLabel promoted={master.promoted} /> : null}
    </div>
  );

  return (
    <article
      id={`master-${master.id}`}
      data-master-id={master.id}
      onMouseEnter={() => hover(master.id)}
      onMouseLeave={() => hover(null)}
      className={cn(
        'group relative scroll-mt-28 rounded-3xl border bg-surface shadow-card transition-[border-color,box-shadow] duration-300',
        compact ? 'flex gap-3 p-2.5' : 'grid gap-4 p-3 sm:grid-cols-[13.5rem_minmax(0,1fr)] sm:p-3.5',
        highlighted ? 'border-accent/50 shadow-glow' : 'border-line hover:border-line-strong hover:shadow-float',
        className,
      )}
    >
      {/* Вся карточка кликабельна мышью; для клавиатуры и скринридеров ссылка — название */}
      <Link href={href} className="absolute inset-0 z-0 rounded-3xl" aria-hidden tabIndex={-1} />

      <MasterGallery
        master={master}
        onOpen={() => router.push(href)}
        className={cn('relative z-[1]', compact ? 'size-24 shrink-0 rounded-xl' : 'aspect-[4/3] w-full self-start')}
        overlay={
          <>
            {!compact ? labels : null}
            {mediaActions ? <div className="absolute right-1.5 top-1.5 rounded-full bg-black/35 text-white backdrop-blur [&_button]:text-white">{mediaActions}</div> : null}
          </>
        }
      />

      <div className="pointer-events-none relative flex min-w-0 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className={cn('truncate font-bold leading-snug transition-colors group-hover:text-accent', compact ? 'text-[14px]' : 'text-[17px]')}>
                <Link href={href} className="pointer-events-auto relative z-10 rounded-sm focus-visible:outline-2 focus-visible:outline-accent">
                  {master.name}
                </Link>
              </h3>
              {master.verified ? (
                <span className="pointer-events-auto shrink-0">
                  <VerifiedBadge verification={master.verification} compact />
                </span>
              ) : null}
            </div>
            {!compact ? <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{master.tagline}</p> : null}
          </div>
          {topActions ? <div className="pointer-events-auto relative z-10 -mr-1 -mt-1 flex shrink-0 gap-0.5">{topActions}</div> : null}
        </div>

        <div className={cn(compact ? 'mt-1' : 'mt-2.5')}>
          <PriceBlock master={master} priceCaption={priceCaption} serviceNames={serviceNames} compact={compact} />
        </div>

        <div className={cn(compact ? 'mt-1' : 'mt-2.5')}>
          <Meta master={master} compact={compact} />
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
          <OpenStatus state={master.openState} />
          {!compact ? (
            <span className="truncate text-subtle">
              {master.districtName}
              {master.landmark ? ` · ${master.landmark}` : ''}
            </span>
          ) : null}
        </div>

        {!compact ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
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
            {master.visitTypes.map((visit) => (
              <Badge key={visit} size="sm">
                {t(`search.visit.${visit}`)}
              </Badge>
            ))}
            <Badge size="sm">{t('master.experience', { years: t('common.years', { count: master.experienceYears }) })}</Badge>
          </div>
        ) : null}

        {primaryAction ? (
          <div className={cn('pointer-events-auto relative z-10 flex flex-wrap items-center gap-2', compact ? 'mt-2' : 'mt-auto pt-3.5 sm:justify-end')}>{primaryAction}</div>
        ) : null}
      </div>
    </article>
  );
}

export function MasterCardSkeleton({ variant = 'row' }: { variant?: 'row' | 'compact' }) {
  if (variant === 'compact') {
    return (
      <div className="flex gap-3 rounded-3xl border border-line bg-surface p-2.5">
        <Skeleton className="size-24 rounded-xl" />
        <div className="flex-1 space-y-2 py-1">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-4 rounded-3xl border border-line bg-surface p-3.5 sm:grid-cols-[15rem_1fr]">
      <Skeleton className="aspect-[4/3] w-full rounded-2xl sm:aspect-auto sm:h-48" />
      <div className="space-y-2.5 py-1">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-6 w-2/5" />
        <Skeleton className="h-3 w-2/3" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
