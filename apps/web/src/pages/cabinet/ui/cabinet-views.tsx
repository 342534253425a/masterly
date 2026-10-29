'use client';

import { useQuery } from '@tanstack/react-query';
import { Building, Crown, Megaphone, Receipt } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { InviteStaffDialog, RemoveStaffButton } from '@/features/manage-team';
import { ReplyForm } from '@/features/reply-to-review';
import { InvoiceDialog } from '@/features/request-invoice';
import { cabinetQueries } from '@/entities/master';
import { ReviewCard } from '@/entities/review';
import { formatDate, formatNumber, formatPercent, formatPrice } from '@/shared/lib';
import { AreaChart, Avatar, Badge, Card, CardContent, CardHeader, CardTitle, Columns, Donut, EmptyState, SegmentedControl, Skeleton } from '@/shared/ui';

export function CabinetReviewsView() {
  const t = useTranslations('cabinet.reviews');
  const [filter, setFilter] = useState<'all' | 'unanswered'>('unanswered');
  const { data } = useQuery(cabinetQueries.reviews());
  if (!data) return <Skeleton className="h-96 rounded-3xl" />;
  const items = filter === 'unanswered' ? data.filter((r) => !r.reply) : data;
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'unanswered', label: `${t('filterUnanswered')} · ${data.filter((r) => !r.reply).length}` },
          { value: 'all', label: `${t('filterAll')} · ${data.length}` },
        ]}
      />
      {items.length === 0 ? <EmptyState title="✓" description={t('subtitle')} /> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((review) => (
          <ReviewCard key={review.id} review={review} footer={<ReplyForm review={review} />} />
        ))}
      </div>
    </div>
  );
}

export function CabinetAnalyticsView() {
  const t = useTranslations('cabinet.analytics');
  const tKpi = useTranslations('cabinet.kpi');
  const locale = useLocale();
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const { data } = useQuery(cabinetQueries.analytics(period));
  return (
    <div className="flex flex-col gap-5">
      <SegmentedControl value={period} onChange={setPeriod} options={(['7d', '30d', '90d'] as const).map((value) => ({ value, label: t(`period.${value}`) }))} />
      {!data ? (
        <Skeleton className="h-80 rounded-3xl" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('dynamics')}</CardTitle>
            </CardHeader>
            <CardContent>
              <AreaChart
                labels={data.series.map((point) => formatDate(point.date, locale, { day: 'numeric', month: 'short' }))}
                series={[
                  { key: 'views', label: tKpi('views'), values: data.series.map((p) => p.views), color: '#8b5cf6' },
                  { key: 'contacts', label: tKpi('contacts'), values: data.series.map((p) => p.contacts), color: '#38bdf8' },
                  { key: 'leads', label: tKpi('leads'), values: data.series.map((p) => p.leads), color: '#34d399' },
                ]}
                format={(v) => formatNumber(v, locale)}
              />
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('sources')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Donut segments={data.sources.map((s) => ({ label: t(`source.${s.source}`), value: s.share }))}>
                  <span className="text-xs text-muted">{tKpi('views')}</span>
                  <span className="text-lg font-extrabold">{formatNumber(data.series.reduce((sum, p) => sum + p.views, 0), locale)}</span>
                </Donut>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('hours')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Columns values={data.hours} labels={data.hours.map((_, h) => `${h}:00`)} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t('queries')}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-subtle">
                    <th className="pb-2 font-semibold">{t('query')}</th>
                    <th className="pb-2 text-right font-semibold">{t('impressions')}</th>
                    <th className="pb-2 text-right font-semibold">{t('ctr')}</th>
                    <th className="pb-2 text-right font-semibold">{t('leadsCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.queries.map((query) => (
                    <tr key={query.query} className="border-t border-line">
                      <td className="py-2.5">«{query.query}»</td>
                      <td className="py-2.5 text-right tabular-nums">{formatNumber(query.impressions, locale)}</td>
                      <td className="py-2.5 text-right tabular-nums">{formatPercent(query.ctr, locale)}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums text-success">{query.leads}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('market')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs text-muted">{t('avgRating')}</div>
                <div className="text-2xl font-extrabold">{data.competitors.avgRating.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">{t('avgResponse')}</div>
                <div className="text-2xl font-extrabold">{data.competitors.avgResponseMin} мин</div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export function CabinetTeamView() {
  const t = useTranslations('cabinet.team');
  const tm = useTranslations('master');
  const { data } = useQuery(cabinetQueries.team());
  if (!data) return <Skeleton className="h-80 rounded-3xl" />;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>
            {t('staff')} <span className="ml-2 text-sm font-medium text-muted">{t('seats', { used: data.seats.used, limit: data.seats.limit })}</span>
          </CardTitle>
          <InviteStaffDialog team={data} />
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-line">
            {data.staff.map((member) => (
              <li key={member.id} className="flex items-center gap-3 py-3">
                <Avatar initials={member.name.split(' ').map((p) => p[0]).join('')} hue={(member.name.length * 37) % 360} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{member.name}</div>
                  <div className="text-xs text-muted">
                    {tm(`staffRole.${member.role}`)} · {member.experienceYears} лет опыта
                  </div>
                </div>
                {member.role !== 'owner' ? <RemoveStaffButton staffId={member.id} /> : <Badge tone="accent">{tm('staffRole.owner')}</Badge>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="size-4 text-accent" /> {t('branches')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.branches.length === 0 ? <p className="text-sm text-muted">{t('noBranches')}</p> : null}
          <ul className="flex flex-col gap-3">
            {data.branches.map((branch) => (
              <li key={branch.id} className="rounded-2xl border border-line p-3">
                <div className="text-sm font-bold">{branch.districtName}</div>
                <div className="text-xs text-muted">{branch.address}</div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export function CabinetBillingView() {
  const t = useTranslations('cabinet.billing');
  const locale = useLocale();
  const { data } = useQuery(cabinetQueries.billing());
  if (!data) return <Skeleton className="h-80 rounded-3xl" />;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Card variant={data.plan === 'pro' ? 'gradient' : 'default'} className="p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted">
            <Crown className="size-4 text-accent" /> {t('current')}
          </div>
          <div className="mt-2 text-3xl font-extrabold">{data.plan === 'pro' ? 'Masterly Pro' : t('free')}</div>
          {data.planUntil ? <div className="mt-1 text-sm text-muted">{t('until', { date: formatDate(data.planUntil, locale, { day: 'numeric', month: 'long' }) })}</div> : null}
          <div className="mt-5">
            <InvoiceDialog defaultProduct={data.plan === 'pro' ? 'pro_year' : 'pro_month'} />
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted">
            <Megaphone className="size-4 text-warning" /> {t('promotion')}
          </div>
          <div className="mt-2 text-xl font-extrabold">
            {data.promotion.active && data.promotion.until
              ? t('promotionActive', { date: formatDate(data.promotion.until, locale, { day: 'numeric', month: 'long' }), count: formatNumber(data.promotion.impressions, locale) })
              : t('promotionInactive')}
          </div>
          <p className="mt-2 text-xs text-subtle">{t('noPayments')}</p>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="size-4 text-accent" /> {t('invoices')}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <tbody>
              {data.invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t border-line first:border-none">
                  <td className="py-3 font-semibold">{invoice.number}</td>
                  <td className="py-3 text-muted">{t(`products.${invoice.product}`).split(' — ')[0]}</td>
                  <td className="py-3 text-muted">{formatDate(invoice.issuedAt, locale, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="py-3 text-right font-bold tabular-nums">{formatPrice(invoice.amount, locale)}</td>
                  <td className="py-3 text-right">
                    <Badge tone={invoice.status === 'paid' ? 'success' : invoice.status === 'issued' ? 'warning' : 'neutral'}>{t(`status.${invoice.status}`)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
