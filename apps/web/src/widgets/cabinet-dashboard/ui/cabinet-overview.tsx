'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Crown, Eye, Gauge, Inbox, MousePointerClick, Percent, Search, Timer } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { cabinetQueries } from '@/entities/master';
import { useSession } from '@/entities/session';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { formatCompact, formatNumber, formatPercent } from '@/shared/lib';
import { Badge, BarList, buttonVariants, Card, CardContent, CardHeader, CardTitle, Funnel, KpiCard, PageHeader, ProgressRing, Skeleton } from '@/shared/ui';
import { CabinetLeadCard } from './cabinet-lead-card';

const ICONS = { impressions: Search, views: Eye, contacts: MousePointerClick, leads: Inbox, conversion: Percent, response: Timer } as const;

/** Дашборд мастера: KPI со спарклайнами, воронка, востребованные услуги, запросы, полнота профиля, бенчмарки. */
export function CabinetOverview() {
  const t = useTranslations('cabinet');
  const locale = useLocale();
  const { user } = useSession();
  const { data } = useQuery(cabinetQueries.overview());
  if (!data) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-3xl" />
        ))}
      </div>
    );
  }
  const format = (key: string, value: number) =>
    key === 'conversion' ? formatPercent(value, locale) : key === 'response' ? `${value} мин` : formatCompact(value, locale);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Badge tone={data.plan === 'pro' ? 'solid' : 'neutral'} size="lg">
            {data.plan === 'pro' ? <Crown aria-hidden /> : null}
            {data.master.name} · {data.plan === 'pro' ? 'Pro' : 'Free'}
          </Badge>
        }
        title={t('greeting', { name: user?.name.split(' ')[0] ?? '' })}
        description={t('subtitle')}
        actions={
          <Link href={routes.cabinet.leads()} className={buttonVariants()}>
            <Inbox />
            {t('allLeads')}
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {data.kpis.map((kpi) => {
          const Icon = ICONS[kpi.key];
          return (
            <KpiCard key={kpi.key} label={t(`kpi.${kpi.key}`)} value={format(kpi.key, kpi.value)} delta={kpi.delta} series={kpi.series} icon={<Icon />} invert={kpi.key === 'response'} />
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t('funnel.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Funnel stages={data.funnel.map((stage) => ({ label: t(`funnel.${stage.stage}`), value: stage.value }))} format={(v) => formatNumber(v, locale)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('completeness')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <ProgressRing value={data.completeness.score} size={84} stroke={8}>
                {data.completeness.score}%
              </ProgressRing>
              <p className="text-sm text-muted">{t('completenessHint')}</p>
            </div>
            <ul className="flex flex-col gap-1.5">
              {data.completeness.missing.map((item) => (
                <li key={item.key}>
                  <Link href={routes.cabinet.profile()} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition hover:bg-surface-2">
                    <span>{item.label}</span>
                    <span className="flex items-center gap-1 text-xs font-bold text-success">
                      +{item.impact}% <ArrowRight className="size-3.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('topServices')}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList items={data.topServices.map((s) => ({ label: s.name, value: s.leads, hint: formatPercent(s.share, locale, 0) }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('topQueries')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-line">
              {data.topQueries.map((query) => (
                <li key={query.query} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <Search className="size-3.5 shrink-0 text-subtle" aria-hidden />
                    <span className="truncate">«{query.query}»</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {t('queryViews', { count: query.views })} · <span className="font-semibold text-success">{t('queryLeads', { count: query.leads })}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t('recentLeads')}</CardTitle>
            <Link href={routes.cabinet.leads()} className="text-sm font-semibold text-accent hover:underline dark:text-accent-2">
              {t('allLeads')}
            </Link>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {data.recentLeads.map((lead) => (
              <CabinetLeadCard key={lead.id} lead={lead} compact />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="size-4 text-accent" /> {t('benchmarks')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">{t('yourResponse')}</span>
              <span className="font-bold text-success">{data.benchmarks.responseTimeMin} мин</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{t('cityResponse')}</span>
              <span className="font-bold">{data.benchmarks.cityResponseTimeMin} мин</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{t('priceIndex')}</span>
              <span className="font-bold">{formatPercent(data.benchmarks.priceIndex, locale, 0)}</span>
            </div>
            {data.unansweredReviews > 0 ? (
              <Link href={routes.cabinet.reviews()} className="mt-2 rounded-2xl border border-warning/30 bg-warning-soft p-3 text-[13px] font-semibold text-warning">
                {t('unanswered', { count: data.unansweredReviews })} →
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
