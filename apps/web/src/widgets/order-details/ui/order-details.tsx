'use client';

import type { Lead } from '@masterly/contracts';
import { useQuery } from '@tanstack/react-query';
import { Check, Clock, CreditCard, MessageCircle, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useLeadActions, ReviewDialog } from '@/features/manage-lead';
import { hueFor, illustrationFor } from '@/entities/catalog';
import { leadQueries, LeadProgress, LeadStatusBadge, LeadTimeline } from '@/entities/lead';
import { MasterAvatar, PriceTag } from '@/entities/master';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { cn, formatDate, formatDuration, formatRelative } from '@/shared/lib';
import { Badge, Button, buttonVariants, Card, CardContent, CardHeader, CardTitle, DeviceIllustration, RatingValue, Skeleton } from '@/shared/ui';

function Responses({ lead }: { lead: Lead }) {
  const t = useTranslations();
  const locale = useLocale();
  const actions = useLeadActions(lead.id);
  const open = !['accepted', 'in_progress', 'completed', 'cancelled'].includes(lead.status);
  if (lead.responses.length === 0) {
    return (
      <Card className="flex items-center gap-4 p-5">
        <span className="relative flex size-12 shrink-0 items-center justify-center">
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-accent/40" />
          <Sparkles className="relative size-6 text-accent" />
        </span>
        <p className="text-sm text-muted">{t('orders.waiting')}</p>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {lead.responses.map((response) => (
        <Card key={response.id} className={cn('p-5', response.status === 'accepted' && 'border-accent/50 shadow-glow')}>
          <div className="flex items-start gap-3">
            <MasterAvatar master={response.master} size="md" />
            <div className="min-w-0 flex-1">
              <Link href={routes.master(response.master.slug)} className="font-bold hover:underline">
                {response.master.name}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                <RatingValue rating={response.master.rating} count={response.master.reviewsCount} />
                <span>{response.master.districtName}</span>
                <span>{formatRelative(response.createdAt, locale)}</span>
              </div>
            </div>
            <div className="text-right">
              {response.price ? <PriceTag range={response.price} /> : null}
              {response.etaMin ? (
                <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-subtle">
                  <Clock className="size-3" /> {t('orders.eta', { time: formatDuration(response.etaMin, locale) })}
                </div>
              ) : null}
            </div>
          </div>
          <p className="mt-3 rounded-2xl bg-surface-2/60 p-3.5 text-[14px] leading-relaxed">{response.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {response.status === 'accepted' ? (
              <Badge tone="accent" size="lg">
                <Check aria-hidden /> {t('orders.chosen')}
              </Badge>
            ) : open ? (
              <Button size="sm" loading={actions.accept.isPending && actions.accept.variables === response.id} onClick={() => actions.accept.mutate(response.id)}>
                <Check />
                {t('orders.choose')}
              </Button>
            ) : null}
            {lead.conversationId && response.status === 'accepted' ? (
              <Link href={routes.messages(lead.conversationId)} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <MessageCircle />
                {t('orders.chat')}
              </Link>
            ) : null}
            <Link href={routes.master(response.master.slug)} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              {t('messages.toProfile')}
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function OrderDetails({ id }: { id: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const { data: lead } = useQuery(leadQueries.detail(id));
  const actions = useLeadActions(id);
  if (!lead) return <Skeleton className="h-96 rounded-3xl" />;
  const canCancel = !['completed', 'cancelled', 'in_progress'].includes(lead.status);
  const canComplete = ['accepted', 'in_progress'].includes(lead.status);
  const acceptedName = lead.master?.name ?? '';

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <div className="relative flex flex-wrap items-center gap-5 p-5 sm:p-6">
          <DeviceIllustration variant={illustrationFor(lead.service.id)} hue={hueFor(lead.service.id)} className="size-24 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <LeadStatusBadge status={lead.status} size="lg" />
              <span className="text-xs text-subtle">{t('orders.number', { number: lead.number })} · {formatDate(lead.createdAt, locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight">
              {lead.service.name}
              {lead.model ? <span className="text-muted"> · {lead.model.name}</span> : null}
            </h1>
          </div>
        </div>
        <div className="border-t border-line p-5 sm:px-6">
          <LeadProgress status={lead.status} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="mb-3 text-lg font-bold">{t('orders.offersTitle')}</h2>
            <Responses lead={lead} />
          </section>
          <Card>
            <CardHeader>
              <CardTitle>{t('orders.details')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <p className="text-[14px] leading-relaxed sm:col-span-2">{lead.description}</p>
              {[
                [t('lead.urgency'), t(`lead.urgencyOptions.${lead.urgency}`)],
                [t('lead.visitType'), t(`search.visit.${lead.visitType}`)],
                [t('lead.channel'), t(`lead.channels.${lead.preferredChannel}`)],
                [t('lead.sharePhone'), lead.sharePhone ? '✓' : '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-xs font-semibold text-subtle">{label}</div>
                  <div className="mt-0.5 text-sm font-semibold">{value}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          {lead.canReview ? <ReviewDialog leadId={lead.id} masterName={acceptedName} /> : null}
          {canComplete ? (
            <Button size="lg" variant="success" loading={actions.complete.isPending} onClick={() => actions.complete.mutate()}>
              <Check />
              {t('orders.complete')}
            </Button>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{t('orders.timeline')}</CardTitle>
            </CardHeader>
            <CardContent>
              <LeadTimeline events={lead.timeline} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('orders.recipientsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {lead.recipients.map((recipient) => (
                <div key={recipient.master.id} className="flex items-center gap-3">
                  <MasterAvatar master={recipient.master} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{recipient.master.name}</span>
                  <LeadStatusBadge status={recipient.status} size="sm" />
                </div>
              ))}
            </CardContent>
          </Card>
          <div className="flex flex-col gap-2 rounded-3xl border border-line p-4 text-xs leading-relaxed text-muted">
            <p className="flex gap-2">
              <CreditCard className="size-4 shrink-0 text-accent" aria-hidden />
              {t('orders.paymentNote')}
            </p>
            <p className="flex gap-2">
              <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
              {t('orders.warrantyNote')}
            </p>
          </div>
          {canCancel ? (
            <Button
              variant="ghost"
              className="text-danger"
              loading={actions.cancel.isPending}
              onClick={() => {
                if (window.confirm(t('orders.cancelConfirm'))) actions.cancel.mutate();
              }}
            >
              <X />
              {t('orders.cancel')}
            </Button>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
