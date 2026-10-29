'use client';

import type { CabinetLead, LeadStatus } from '@masterly/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { cabinetQueries } from '@/entities/master';
import { cn } from '@/shared/lib';
import { Skeleton } from '@/shared/ui';
import { CabinetLeadCard } from './cabinet-lead-card';

const COLUMNS: Array<{ key: 'new' | 'responded' | 'in_progress' | 'done'; statuses: LeadStatus[]; tone: string }> = [
  { key: 'new', statuses: ['new', 'viewed'], tone: 'bg-info' },
  { key: 'responded', statuses: ['responded'], tone: 'bg-accent' },
  { key: 'in_progress', statuses: ['accepted', 'in_progress'], tone: 'bg-warning' },
  { key: 'done', statuses: ['completed', 'declined', 'cancelled', 'expired'], tone: 'bg-success' },
];

/** Канбан заявок мастера. Обновляется в реальном времени (в бою — WebSocket-события leads.lead.v1). */
export function LeadsBoard() {
  const t = useTranslations('cabinet.leads');
  const { data } = useQuery(cabinetQueries.leads());
  if (!data) return <Skeleton className="h-[520px] rounded-3xl" />;
  const groups = COLUMNS.map((column) => ({ ...column, items: data.filter((lead: CabinetLead) => column.statuses.includes(lead.status)) }));
  return (
    <div className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 xl:grid xl:grid-cols-4 xl:overflow-visible">
      {groups.map((column) => (
        <section key={column.key} className="flex w-[300px] shrink-0 snap-start flex-col gap-3 xl:w-auto">
          <h2 className="flex items-center gap-2 px-1 text-sm font-bold">
            <span className={cn('size-2 rounded-full', column.tone)} />
            {t(`columns.${column.key}`)}
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{column.items.length}</span>
          </h2>
          <div className="flex min-h-40 flex-col gap-3 rounded-3xl border border-dashed border-line bg-surface/40 p-2.5">
            {column.items.length === 0 ? <p className="py-10 text-center text-xs text-subtle">{t('empty')}</p> : null}
            {column.items.map((lead) => (
              <CabinetLeadCard key={lead.id} lead={lead} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
