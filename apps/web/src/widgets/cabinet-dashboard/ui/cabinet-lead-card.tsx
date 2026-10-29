'use client';

import type { CabinetLead } from '@masterly/contracts';
import { Clock, EyeOff, MapPin, MessageCircle, Phone, Zap } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { LeadStatusActions } from '@/features/respond-to-lead';
import { LeadStatusBadge } from '@/entities/lead';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { cn, formatDistance, formatPrice, formatRelative } from '@/shared/lib';
import { Avatar, Badge, buttonVariants } from '@/shared/ui';

export function CabinetLeadCard({ lead, compact }: { lead: CabinetLead; compact?: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const urgent = lead.urgency === 'asap' || lead.urgency === 'today';
  return (
    <article className={cn('rounded-2xl border bg-surface p-4 transition-colors', lead.status === 'new' ? 'border-accent/40 shadow-glow' : 'border-line')}>
      <div className="flex items-start gap-3">
        <Avatar initials={lead.client.initials} hue={(lead.client.name.charCodeAt(0) * 7) % 360} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold">{lead.service.name}</span>
            {urgent ? (
              <Badge tone="warning" size="sm">
                <Zap aria-hidden />
                {t(`lead.urgencyOptions.${lead.urgency}`)}
              </Badge>
            ) : null}
          </div>
          <div className="truncate text-xs text-muted">{lead.model?.name ?? t('lead.unknownModel')}</div>
        </div>
        <LeadStatusBadge status={lead.status} size="sm" />
      </div>
      {compact ? null : <p className="mt-2.5 line-clamp-3 text-[13px] leading-relaxed text-fg/85">{lead.description}</p>}
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-subtle">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" aria-hidden /> {formatRelative(lead.createdAt, locale)}
        </span>
        {lead.distanceKm !== null ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" aria-hidden /> {formatDistance(lead.distanceKm, locale)}
          </span>
        ) : null}
        <span>{t(`search.visit.${lead.visitType}`)}</span>
        <span>{t('cabinet.leads.competitors', { count: lead.competitors })}</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11.5px]">
        {lead.client.phone ? (
          <a href={`tel:${lead.client.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 font-semibold text-success">
            <Phone className="size-3" aria-hidden /> {lead.client.phone}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 text-subtle">
            <EyeOff className="size-3" aria-hidden /> {t('cabinet.leads.phoneHidden')}
          </span>
        )}
      </div>
      {lead.myResponse?.price ? (
        <div className="mt-2.5 rounded-xl bg-accent-soft px-3 py-2 text-xs font-semibold">
          {t('cabinet.leads.yourOffer', { price: formatPrice(lead.myResponse.price.from, locale) })}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <LeadStatusActions lead={lead} />
        {lead.conversationId ? (
          <Link href={routes.messages(lead.conversationId)} className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} aria-label={t('orders.chat')}>
            <MessageCircle />
          </Link>
        ) : null}
      </div>
    </article>
  );
}
