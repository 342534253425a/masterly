'use client';

import type { CompareItem } from '@masterly/contracts';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, GitCompareArrows, Send, Trophy, X } from 'lucide-react';
import { parseAsString, useQueryStates } from 'nuqs';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCompare } from '@/features/compare-masters';
import { useLeadWizard } from '@/features/create-lead';
import { catalogQueries } from '@/entities/catalog';
import { useCurrentCity } from '@/entities/city';
import { MasterAvatar, masterQueries, OpenStatus, warrantyMonths } from '@/entities/master';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { cn, formatDistance, formatDuration, formatPrice } from '@/shared/lib';
import { useHydrated } from '@/shared/lib/hooks';
import { Badge, Button, buttonVariants, Chip, EmptyState, RatingValue, Skeleton } from '@/shared/ui';

type Best = 'price' | 'rating' | 'warranty' | 'response' | 'distance';

export function CompareTable() {
  const t = useTranslations();
  const locale = useLocale();
  const hydrated = useHydrated();
  const { slug: city } = useCurrentCity();
  const [{ ids: idsParam, service, model }, setParams] = useQueryStates({ ids: parseAsString, service: parseAsString.withDefault('zamena-displeya'), model: parseAsString });
  const stored = useCompare((s) => s.items);
  const remove = useCompare((s) => s.remove);
  const openWizard = useLeadWizard((s) => s.openWizard);
  const ids = idsParam ? idsParam.split(',').filter(Boolean) : hydrated ? stored.map((item) => item.id) : [];
  const { data: services } = useQuery(catalogQueries.services(city));
  const { data: models } = useQuery(catalogQueries.models('apple'));
  const { data, isPending } = useQuery(masterQueries.compare(ids, service, model ?? undefined));

  if (hydrated && ids.length === 0) {
    return (
      <EmptyState
        icon={<GitCompareArrows />}
        title={t('compare.title')}
        description={t('compare.empty')}
        action={
          <Link href={routes.search({ city })} className={buttonVariants()}>
            {t('compare.toSearch')}
          </Link>
        }
      />
    );
  }
  if (isPending || !data) return <Skeleton className="h-[520px] rounded-3xl" />;

  const isBest = (item: CompareItem, key: Best) => data.best[key] === item.id;
  const rows: Array<{ label: string; best?: Best; render: (item: CompareItem) => ReactNode }> = [
    {
      label: t('compare.rows.price'),
      best: 'price',
      render: (item) => {
        const range = item.price?.range ?? (item.offer ? { from: item.offer.priceFrom, to: null } : null);
        return range ? <span className="text-lg font-extrabold">{range.from === 0 ? t('common.free') : formatPrice(range.from, locale)}</span> : '—';
      },
    },
    { label: t('compare.rows.warranty'), best: 'warranty', render: (item) => t('common.warrantyMonths', { months: warrantyMonths(item.offer?.warrantyDays ?? item.warrantyDays) }) },
    { label: t('compare.rows.rating'), best: 'rating', render: (item) => <RatingValue rating={item.rating} count={item.reviewsCount} /> },
    { label: t('compare.rows.response'), best: 'response', render: (item) => `~${formatDuration(item.responseTimeMin, locale)} · ${Math.round(item.responseRate * 100)}%` },
    { label: t('compare.rows.duration'), render: (item) => (item.offer ? formatDuration(item.offer.durationMin, locale) : '—') },
    { label: t('compare.rows.distance'), best: 'distance', render: (item) => `${item.districtName}${item.distanceKm !== null ? ` · ${formatDistance(item.distanceKm, locale)}` : ''}` },
    { label: t('compare.rows.experience'), render: (item) => `${t('common.years', { count: item.experienceYears })} · ${t('master.completed', { count: item.completedOrders })}` },
    { label: t('compare.rows.parts'), render: (item) => item.partsQualities.map((p) => t(`search.parts.${p}`)).join(', ') },
    { label: t('compare.rows.visit'), render: (item) => item.visitTypes.map((v) => t(`search.visit.${v}`)).join(', ') },
    { label: t('compare.rows.payment'), render: (item) => item.paymentMethods.map((p) => t(`master.payment.${p}`)).join(', ') },
    {
      label: t('compare.rows.verified'),
      render: (item) =>
        item.verified ? (
          <span className="inline-flex items-center gap-1 font-semibold text-info">
            <BadgeCheck className="size-4" /> {t('master.verified')}
          </span>
        ) : (
          '—'
        ),
    },
    { label: t('compare.rows.open'), render: (item) => <OpenStatus state={item.openState} /> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-semibold text-muted">{t('compare.service')}:</span>
        {services?.slice(0, 8).map((s) => (
          <Chip key={s.id} size="sm" active={service === s.slug} onClick={() => void setParams({ service: s.slug })}>
            {s.short}
          </Chip>
        ))}
        <select
          className="ml-auto h-8 rounded-full border border-line bg-surface-2 px-3 text-xs"
          value={model ?? ''}
          onChange={(event) => void setParams({ model: event.target.value || null })}
          aria-label={t('lead.model')}
        >
          <option value="">{t('search.filters.anyModel')}</option>
          {models?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-line bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-48 bg-surface p-4" />
              {data.items.map((item) => (
                <th key={item.id} className="min-w-52 border-l border-line p-4 text-left align-top font-normal">
                  <div className="flex items-start justify-between gap-2">
                    <MasterAvatar master={item} size="lg" />
                    <Button variant="ghost" size="icon-sm" onClick={() => (idsParam ? void setParams({ ids: ids.filter((id) => id !== item.id).join(',') || null }) : remove(item.id))} aria-label={t('compare.remove')}>
                      <X />
                    </Button>
                  </div>
                  <Link href={routes.master(item.slug, { service, model: model ?? undefined })} className="mt-3 block font-bold hover:underline">
                    {item.name}
                  </Link>
                  <div className="mt-0.5 text-xs text-muted">{item.tagline}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <th scope="row" className="sticky left-0 z-10 bg-surface p-4 text-left text-[13px] font-semibold text-muted">
                  {row.label}
                </th>
                {data.items.map((item) => {
                  const best = row.best ? isBest(item, row.best) : false;
                  return (
                    <td key={item.id} className={cn('border-l border-line p-4 align-middle', best && 'bg-success-soft/60')}>
                      <div className="flex flex-col items-start gap-1">
                        {row.render(item)}
                        {best ? (
                          <Badge tone="success" size="sm">
                            <Trophy aria-hidden />
                            {t('compare.best')}
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={() =>
            openWizard({
              masterIds: data.items.map((item) => item.id),
              masterNames: data.items.map((item) => item.name),
              serviceId: data.service?.id ?? null,
              modelId: data.model?.id ?? null,
            })
          }
        >
          <Send />
          {t('compare.requestAll', { count: data.items.length })}
        </Button>
      </div>
    </div>
  );
}
