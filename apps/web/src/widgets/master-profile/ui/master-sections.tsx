'use client';

import type { MasterProfile } from '@masterly/contracts';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Building, Clock, CreditCard, MapPin, ShieldCheck, Sparkles, Users, Wrench } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { catalogQueries, hueFor, illustrationFor } from '@/entities/catalog';
import { masterQueries, warrantyMonths, type ReviewFilters } from '@/entities/master';
import { RatingBreakdown, ReviewCard } from '@/entities/review';
import { cn, formatDate, formatDuration, formatPrice } from '@/shared/lib';
import { Badge, Button, Card, Chip, DeviceIllustration, EmptyState, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from '@/shared/ui';

export function OffersTable({ master, modelId, onModelChange }: { master: MasterProfile; modelId: string | null; onModelChange: (modelId: string | null) => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const { data: services } = useQuery(catalogQueries.services());
  const { data: models } = useQuery(catalogQueries.models());
  const supported = models?.filter((m) => master.brandIds.includes(m.brandId)) ?? [];
  const serviceName = (id: string) => services?.find((s) => s.id === id)?.name ?? id;
  const model = supported.find((m) => m.id === modelId);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:p-5">
        <p className="text-sm text-muted">{model ? t('master.offers.modelPrice', { model: model.fullName }) : t('master.offers.selectModel')}</p>
        <Select value={modelId ?? 'none'} onValueChange={(value) => onModelChange(value === 'none' ? null : value)}>
          <SelectTrigger className="w-full sm:w-64" aria-label={t('lead.model')}>
            <SelectValue placeholder={t('search.filters.anyModel')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t('search.filters.anyModel')}</SelectItem>
            {supported.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ul className="divide-y divide-line">
        {master.offers.map((offer) => {
          const price = offer.modelPrice;
          return (
            <li key={offer.serviceId} className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-2/50 sm:px-5">
              <DeviceIllustration variant={illustrationFor(offer.serviceId)} hue={hueFor(offer.serviceId)} className="size-12 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{serviceName(offer.serviceId)}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-subtle">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" aria-hidden /> {formatDuration(offer.durationMin, locale)}
                  </span>
                  {offer.warrantyDays > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="size-3" aria-hidden /> {t('common.warrantyMonths', { months: warrantyMonths(offer.warrantyDays) })}
                    </span>
                  ) : null}
                  {offer.parts.length ? <span>{offer.parts.map((p) => t(`search.parts.${p}`)).join(' · ')}</span> : null}
                </div>
              </div>
              <div className="text-right">
                {price ? (
                  <div className="text-[15px] font-extrabold tabular-nums">
                    {price.from === 0
                      ? t('master.offers.free')
                      : price.to
                        ? t('common.priceRange', { from: formatPrice(price.from, locale).replace(/\s?₽/, ''), to: formatPrice(price.to, locale) })
                        : formatPrice(price.from, locale)}
                  </div>
                ) : (
                  <div className="text-[15px] font-extrabold tabular-nums">
                    {offer.priceFrom === 0 ? t('master.offers.free') : t('master.offers.fromPrice', { price: formatPrice(offer.priceFrom, locale) })}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function ReviewsSection({ master }: { master: MasterProfile }) {
  const t = useTranslations('reviews');
  const tCommon = useTranslations('common');
  const [filters, setFilters] = useState<ReviewFilters>({});
  const query = useInfiniteQuery(masterQueries.reviews(master.id, filters));
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <RatingBreakdown rating={master.rating} distribution={master.ratingDistribution} total={master.reviewsCount} />
        <p className="flex max-w-xs items-start gap-2 text-xs leading-relaxed text-muted">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          {t('antifraud')}
        </p>
      </Card>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip size="sm" active={!filters.rating && !filters.withPhotos} onClick={() => setFilters({ sort: filters.sort })}>
          {t('all')}
        </Chip>
        {[5, 4, 3, 2, 1].map((star) => (
          <Chip key={star} size="sm" active={filters.rating === star} onClick={() => setFilters({ ...filters, rating: filters.rating === star ? undefined : star })}>
            {star} ★
          </Chip>
        ))}
        <Chip size="sm" active={Boolean(filters.withPhotos)} onClick={() => setFilters({ ...filters, withPhotos: filters.withPhotos ? undefined : true })}>
          {t('withPhotos')}
        </Chip>
        <Select value={filters.sort ?? 'recent'} onValueChange={(sort) => setFilters({ ...filters, sort: sort as ReviewFilters['sort'] })}>
          <SelectTrigger className="ml-auto h-8 w-auto min-w-44 rounded-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {(['recent', 'rating_desc', 'rating_asc', 'helpful'] as const).map((sort) => (
              <SelectItem key={sort} value={sort}>
                {t(`sort.${sort}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {query.isPending ? <Skeleton className="h-40 rounded-3xl" /> : null}
      {!query.isPending && items.length === 0 ? <EmptyState title={t('empty')} /> : null}
      <div className={cn('flex flex-col gap-3 transition-opacity', query.isPlaceholderData && 'opacity-60')}>
        {items.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>
      {query.hasNextPage ? (
        <Button variant="secondary" className="mx-auto" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {tCommon('showMore')}
        </Button>
      ) : null}
    </div>
  );
}

export function WorksGallery({ master }: { master: MasterProfile }) {
  const t = useTranslations('master');
  if (master.photos.length === 0) return <EmptyState icon={<Wrench />} title={t('works.empty')} />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {master.photos.map((photo, i) => (
        <figure key={photo.id} className="group relative aspect-square overflow-hidden rounded-3xl border border-line bg-surface">
          <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(90% 80% at 50% 30%, hsl(${(master.hue + i * 25) % 360} 70% 50% / 0.25), transparent 70%)` }} />
          <DeviceIllustration
            variant={illustrationFor(photo.serviceId)}
            hue={(master.hue + i * 25) % 360}
            className="absolute inset-0 m-auto size-[78%] transition-transform duration-500 group-hover:scale-105"
          />
          <figcaption className="absolute inset-x-2 bottom-2 truncate rounded-xl bg-black/45 px-2.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur">{photo.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function AboutSection({ master }: { master: MasterProfile }) {
  const t = useTranslations('master');
  const locale = useLocale();
  const weekdays = t.raw('weekdays') as string[];
  const { data: brands } = useQuery(catalogQueries.brands());
  const allBrands = brands && master.brandIds.length >= brands.length;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-5 md:col-span-2">
        <h3 className="font-bold">{t('about.title')}</h3>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{master.about}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-subtle">
          <span>{t('about.joined', { date: formatDate(master.joinedAt, locale, { month: 'long', year: 'numeric' }) })}</span>
          <span>·</span>
          <span>{t('about.responseRate', { value: `${Math.round(master.responseRate * 100)}%` })}</span>
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="flex items-center gap-2 font-bold">
          <Clock className="size-4 text-accent" aria-hidden /> {t('about.schedule')}
        </h3>
        <ul className="mt-3 space-y-1.5 text-sm">
          {master.schedule.map((day, i) => (
            <li key={i} className={cn('flex justify-between', !day && 'text-subtle')}>
              <span className="font-medium">{weekdays[i]}</span>
              <span className="tabular-nums">{day ? (day.close === '23:59' ? t('allDay') : `${day.open} – ${day.close}`) : t('dayOff')}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h3 className="flex items-center gap-2 font-bold">
            <MapPin className="size-4 text-accent" aria-hidden /> {t('about.address')}
          </h3>
          <p className="mt-1.5 text-sm text-muted">
            {master.address} · {master.districtName} · {master.landmark}
          </p>
        </div>
        <div>
          <h3 className="flex items-center gap-2 font-bold">
            <CreditCard className="size-4 text-accent" aria-hidden /> {t('about.payment')}
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {master.paymentMethods.map((method) => (
              <Badge key={method}>{t(`payment.${method}`)}</Badge>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-bold">{t('about.brands')}</h3>
          <p className="mt-1.5 text-sm text-muted">{allBrands ? t('about.allBrands') : brands?.filter((b) => master.brandIds.includes(b.id)).map((b) => b.name).join(', ')}</p>
        </div>
      </Card>
      {master.branches.length ? (
        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-bold">
            <Building className="size-4 text-accent" aria-hidden /> {t('about.branches')}
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            {master.branches.map((branch) => (
              <li key={branch.id}>
                <div className="font-semibold">{branch.districtName}</div>
                <div className="text-muted">{branch.address}</div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {master.staff.length ? (
        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-bold">
            <Users className="size-4 text-accent" aria-hidden /> {t('about.staff')}
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            {master.staff.map((member) => (
              <li key={member.id} className="flex justify-between gap-3">
                <span className="font-medium">{member.name}</span>
                <span className="text-muted">{t(`staffRole.${member.role}`)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
