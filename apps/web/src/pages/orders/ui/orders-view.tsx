'use client';

import type { LeadSummary } from '@masterly/contracts';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ClipboardList, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useLeadWizard } from '@/features/create-lead';
import { hueFor, illustrationFor } from '@/entities/catalog';
import { leadQueries, LeadStatusBadge } from '@/entities/lead';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { formatPrice, formatRelative } from '@/shared/lib';
import { Button, DeviceIllustration, EmptyState, SegmentedControl, Skeleton } from '@/shared/ui';

const ARCHIVE = new Set(['completed', 'cancelled', 'declined', 'expired']);

function LeadRow({ lead }: { lead: LeadSummary }) {
  const t = useTranslations('orders');
  const locale = useLocale();
  return (
    <Link href={routes.order(lead.id)} className="group flex items-center gap-4 rounded-3xl border border-line bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-line-strong sm:p-5">
      <DeviceIllustration variant={illustrationFor(lead.service.id)} hue={hueFor(lead.service.id)} className="size-16 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <LeadStatusBadge status={lead.status} />
          <span className="text-xs text-subtle">
            {t('number', { number: lead.number })} · {formatRelative(lead.updatedAt, locale)}
          </span>
        </div>
        <div className="mt-1.5 truncate font-bold">
          {lead.service.name}
          {lead.model ? <span className="font-medium text-muted"> · {lead.model.name}</span> : null}
        </div>
        <div className="mt-1 text-[13px] text-muted">
          {lead.master ? lead.master.name : t('recipients', { count: lead.recipientsCount })} · {t('responses', { count: lead.responsesCount })}
          {lead.bestPrice ? <span className="font-semibold text-fg"> · {t('bestPrice', { price: formatPrice(lead.bestPrice.from, locale) })}</span> : null}
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function OrdersView() {
  const t = useTranslations('orders');
  const [tab, setTab] = useState<'active' | 'archive'>('active');
  const openWizard = useLeadWizard((s) => s.openWizard);
  const { data, isPending } = useQuery(leadQueries.list());
  const items = data?.filter((lead) => (tab === 'archive' ? ARCHIVE.has(lead.status) : !ARCHIVE.has(lead.status))) ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'active', label: t('active') },
            { value: 'archive', label: t('archive') },
          ]}
        />
        <Button onClick={() => openWizard()}>
          <Plus />
          {t('create')}
        </Button>
      </div>
      {isPending ? <Skeleton className="h-28 rounded-3xl" /> : null}
      {!isPending && items.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title={t('empty')} description={t('emptyText')} action={<Button onClick={() => openWizard()}>{t('create')}</Button>} />
      ) : null}
      {items.map((lead) => (
        <LeadRow key={lead.id} lead={lead} />
      ))}
    </div>
  );
}
