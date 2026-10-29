'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, Clock, ExternalLink, Fingerprint, Search, ShieldAlert, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { CategoryLaunch, DuplicateResolution, ModerationDecision, ServiceToggle, UserAccessControls } from '@/features/moderate-content';
import { MasterAvatar } from '@/entities/master';
import { moderationQueries, RiskMeter, type ModerationKind, type ModerationStatus } from '@/entities/moderation';
import { platformQueries } from '@/entities/platform';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { cn, formatCompact, formatDate, formatNumber, formatPercent, formatPrice, formatRelative } from '@/shared/lib';
import { useDebouncedValue } from '@/shared/lib/hooks';
import { AreaChart, Badge, BarList, Card, CardContent, CardHeader, CardTitle, DynamicIcon, EmptyState, Input, KpiCard, SegmentedControl, Skeleton } from '@/shared/ui';

export function AdminOverviewView() {
  const t = useTranslations('admin');
  const locale = useLocale();
  const { data } = useQuery(platformQueries.overview());
  if (!data) return <Skeleton className="h-96 rounded-3xl" />;
  const format = (value: number, kind: 'int' | 'percent' | 'minutes') => (kind === 'percent' ? formatPercent(value, locale) : kind === 'minutes' ? `${value} мин` : formatCompact(value, locale));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {data.kpis.map((kpi) => (
          <KpiCard key={kpi.key} label={kpi.label} value={format(kpi.value, kpi.format)} delta={kpi.delta} invert={kpi.key === 'zero' || kpi.key === 'response'} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t('searches')}</CardTitle>
          </CardHeader>
          <CardContent>
            <AreaChart
              labels={data.searches.map((p) => formatDate(p.date, locale, { day: 'numeric', month: 'short' }))}
              series={[
                { key: 'total', label: t('searchesTotal'), values: data.searches.map((p) => p.total), color: '#8b5cf6' },
                { key: 'zero', label: t('zeroResults'), values: data.searches.map((p) => p.zeroResults), color: '#fb7185' },
              ]}
              format={(v) => formatNumber(v, locale)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-warning" /> {t('moderationQueue')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: t('pending'), value: data.moderation.pending, icon: Clock, tone: 'text-info' },
              { label: t('highRisk'), value: data.moderation.highRisk, icon: AlertTriangle, tone: 'text-danger' },
              { label: t('slaBreached'), value: data.moderation.slaBreached, icon: CheckCircle, tone: 'text-warning' },
            ].map((item) => (
              <Link key={item.label} href={routes.admin.moderation()} className="rounded-2xl border border-line p-3 transition hover:border-line-strong">
                <item.icon className={cn('mx-auto size-5', item.tone)} />
                <div className="mt-1 text-2xl font-extrabold">{item.value}</div>
                <div className="text-[11px] text-muted">{item.label}</div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('leadsByCity')}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList items={data.leadsByCity.map((city) => ({ label: city.name, value: city.leads, hint: `${city.masters} мастеров` }))} format={(v) => formatNumber(v, locale)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('topCategories')}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList items={data.topCategories.map((c) => ({ label: c.name, value: c.searches, hint: formatPercent(c.share, locale, 0) }))} format={(v) => formatCompact(v, locale)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function ModerationView() {
  const t = useTranslations('admin.moderation');
  const locale = useLocale();
  const [kind, setKind] = useState<ModerationKind | 'all'>('all');
  const [status, setStatus] = useState<ModerationStatus>('pending');
  const { data } = useQuery(moderationQueries.queue(kind === 'all' ? undefined : kind, status));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <SegmentedControl value={kind} onChange={setKind} options={(['all', 'review', 'profile', 'photo', 'description'] as const).map((value) => ({ value, label: t(`kinds.${value}`) }))} />
        <SegmentedControl value={status} onChange={setStatus} options={(['pending', 'approved', 'rejected', 'escalated'] as const).map((value) => ({ value, label: t(`status.${value}`) }))} />
      </div>
      {!data ? <Skeleton className="h-60 rounded-3xl" /> : null}
      {data?.length === 0 ? <EmptyState icon={<CheckCircle />} title={t('empty')} /> : null}
      {data?.map((item) => (
        <Card key={item.id} className={cn('p-5', item.riskScore >= 0.6 && 'border-danger/40')}>
          <div className="flex flex-wrap items-start gap-4">
            <RiskMeter score={item.riskScore} size={52} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">{t(`kinds.${item.kind}`)}</Badge>
                <span className="text-sm font-bold">{item.title}</span>
                <span className="text-xs text-subtle">{formatRelative(item.createdAt, locale)}</span>
              </div>
              <p className="mt-2 rounded-2xl bg-surface-2/60 p-3 text-[14px] leading-relaxed">{item.content}</p>
              <div className="mt-3">
                <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-subtle">{t('reasons')}</div>
                {item.reasons.length === 0 ? <span className="text-xs text-success">{t('noSignals')}</span> : null}
                <ul className="flex flex-wrap gap-1.5">
                  {item.reasons.map((reason) => (
                    <li key={reason.code}>
                      <Badge tone={reason.weight >= 0.3 ? 'danger' : 'warning'} size="lg">
                        <Fingerprint aria-hidden />
                        {reason.label} · +{Math.round(reason.weight * 100)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
              {item.master ? (
                <Link href={routes.master(item.master.slug)} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-accent hover:underline dark:text-accent-2">
                  <MasterAvatar master={item.master} size="xs" /> {item.master.name} <ExternalLink className="size-3" />
                </Link>
              ) : null}
            </div>
            <ModerationDecision item={item} />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function DuplicatesView() {
  const t = useTranslations('admin.duplicates');
  const { data } = useQuery(moderationQueries.duplicates());
  if (!data) return <Skeleton className="h-60 rounded-3xl" />;
  if (data.length === 0) return <EmptyState title={t('empty')} />;
  return (
    <div className="flex flex-col gap-4">
      {data.map((candidate) => (
        <Card key={candidate.id} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {[candidate.a, candidate.b].map((master, i) => (
                <Link key={master.id} href={routes.master(master.slug)} className="flex items-center gap-2.5 rounded-2xl border border-line p-2.5 pr-4 transition hover:border-line-strong">
                  <MasterAvatar master={master} size="md" />
                  <span>
                    <span className="block text-sm font-bold">{master.name}</span>
                    <span className="block text-xs text-muted">
                      {i === 0 ? 'A' : 'B'} · {master.districtName}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={candidate.score >= 0.8 ? 'danger' : 'warning'} size="lg">
                {t('score', { value: `${Math.round(candidate.score * 100)}%` })}
              </Badge>
              {candidate.status !== 'open' ? <Badge tone="success" size="lg">{t(`status.${candidate.status}`)}</Badge> : null}
            </div>
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-3">
            {candidate.signals.map((signal) => (
              <li key={signal.code} className={cn('flex items-center justify-between rounded-xl border px-3 py-2 text-xs', signal.matched ? 'border-danger/30 bg-danger-soft' : 'border-line')}>
                <span className="font-semibold">{signal.label}</span>
                <span className="tabular-nums text-muted">{signal.value}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <DuplicateResolution candidate={candidate} />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function CatalogView() {
  const t = useTranslations('admin.catalog');
  const locale = useLocale();
  const { data: services } = useQuery(platformQueries.services());
  const { data: categories } = useQuery(platformQueries.categories());
  const { data: gaps } = useQuery(platformQueries.searchGaps());
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>{t('categories')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {categories?.map((category) => (
            <div key={category.id} className="flex items-center gap-3 rounded-2xl border border-line p-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <DynamicIcon name={category.icon} className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{category.name}</div>
                <div className="text-xs text-muted">
                  {category.status === 'active' ? `${category.masters} мастеров` : `${t('waitlist')}: ${formatNumber(category.waitlist, locale)}`}
                </div>
              </div>
              <CategoryLaunch category={category} />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('services')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-subtle">
                <th className="pb-2 font-semibold" />
                <th className="pb-2 text-right font-semibold">{t('searches')}</th>
                <th className="pb-2 text-right font-semibold">{t('leads')}</th>
                <th className="pb-2 text-right font-semibold">{t('conversion')}</th>
                <th className="pb-2 text-right font-semibold">{t('enabled')}</th>
              </tr>
            </thead>
            <tbody>
              {services?.map((service) => (
                <tr key={service.id} className="border-t border-line">
                  <td className="py-2.5">
                    <span className="flex items-center gap-2 font-semibold">
                      <DynamicIcon name={service.icon} className="size-4 text-accent" /> {service.name}
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{formatCompact(service.searches30d, locale)}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatCompact(service.leads30d, locale)}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatPercent(service.conversion, locale)}</td>
                  <td className="py-2.5 text-right">
                    <ServiceToggle service={service} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t('gaps')}</CardTitle>
            <p className="mt-1 text-xs text-muted">{t('gapsHint')}</p>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-line">
            {gaps?.map((gap) => (
              <li key={gap.query} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Search className="size-3.5 shrink-0 text-subtle" />
                  <span className="truncate">«{gap.query}»</span>
                  <Badge size="sm">{gap.categoryHint}</Badge>
                </span>
                <span className="flex shrink-0 items-center gap-3 tabular-nums">
                  <span className="font-bold">{gap.count}</span>
                  <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', gap.trend >= 0 ? 'text-success' : 'text-danger')}>
                    {gap.trend >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                    {Math.round(Math.abs(gap.trend) * 100)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export function UsersView() {
  const t = useTranslations('admin.users');
  const locale = useLocale();
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q, 250);
  const { data } = useQuery(platformQueries.users(debounced));
  return (
    <div className="flex flex-col gap-4">
      <Input className="max-w-md" leading={<Users />} placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-xs text-subtle">
              <th className="p-4 font-semibold" />
              <th className="p-4 font-semibold">{t('roles')}</th>
              <th className="p-4 text-right font-semibold">{t('leads')}</th>
              <th className="p-4 text-right font-semibold">{t('lastSeen')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((user) => (
              <tr key={user.id} className="border-t border-line">
                <td className="p-4">
                  <div className="font-bold">{user.name}</div>
                  <div className="text-xs text-muted">
                    {user.phoneMasked} · {user.status === 'active' ? t('active') : <span className="text-danger">{t('blocked')}</span>}
                  </div>
                </td>
                <td className="p-4">
                  <UserAccessControls user={user} />
                </td>
                <td className="p-4 text-right tabular-nums">{user.leadsCount}</td>
                <td className="p-4 text-right text-xs text-muted">{formatRelative(user.lastSeenAt, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function MarketAnalyticsView() {
  const t = useTranslations('admin.analytics');
  const locale = useLocale();
  const { data } = useQuery(platformQueries.prices());
  if (!data) return <Skeleton className="h-96 rounded-3xl" />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('prices')}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-subtle">
              <th className="pb-2 font-semibold">{t('service')}</th>
              <th className="pb-2 font-semibold">{t('city')}</th>
              <th className="pb-2 text-right font-semibold">{t('min')}</th>
              <th className="pb-2 text-right font-semibold">{t('median')}</th>
              <th className="pb-2 text-right font-semibold">{t('max')}</th>
              <th className="pb-2 text-right font-semibold">{t('masters')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={`${row.serviceId}-${row.cityId}`} className="border-t border-line">
                <td className="py-2.5 font-semibold">{row.serviceName}</td>
                <td className="py-2.5 text-muted">{row.cityName}</td>
                <td className="py-2.5 text-right tabular-nums">{formatPrice(row.min, locale)}</td>
                <td className="py-2.5 text-right font-bold tabular-nums">{formatPrice(row.median, locale)}</td>
                <td className="py-2.5 text-right tabular-nums">{formatPrice(row.max, locale)}</td>
                <td className="py-2.5 text-right tabular-nums">{row.mastersCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
