'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { RespondToLead, type CabinetLead } from '@masterly/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Flag, Play, Send, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { cabinetQueries } from '@/entities/master';
import { apiCall, errorMessage } from '@/shared/api';
import { track } from '@/shared/lib';
import { Button, Dialog, DialogContent, Field, Input, Textarea, toast } from '@/shared/ui';

type Values = z.input<typeof RespondToLead>;

function useCabinetLeadMutation<TArgs>(fn: (args: TArgs) => Promise<CabinetLead>, success?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (lead) => {
      queryClient.setQueryData<CabinetLead[]>(cabinetQueries.leads().queryKey, (old) => old?.map((item) => (item.id === lead.id ? lead : item)));
      void queryClient.invalidateQueries({ queryKey: ['cabinet', 'overview'] });
      if (success) toast.success(success);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/** Ответ мастера на заявку: цена «от/до», время и сообщение — клиент сравнит предложения. */
export function RespondDialog({ lead }: { lead: CabinetLead }) {
  const t = useTranslations('cabinet.leads');
  const [open, setOpen] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(RespondToLead),
    defaultValues: { priceFrom: lead.myResponse?.price?.from ?? 0, priceTo: lead.myResponse?.price?.to ?? null, message: lead.myResponse?.message ?? '', etaMin: lead.myResponse?.etaMin ?? 40 },
  });
  const respond = useCabinetLeadMutation((values: Values) => apiCall('respondToLead', { params: { id: lead.id }, body: values }), t('sent'));
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Send />
        {t('respond')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('respondTitle', { number: lead.number })} description={`${lead.service.name}${lead.model ? ` · ${lead.model.name}` : ''}`}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) =>
              respond.mutate(values, {
                onSuccess: () => {
                  setOpen(false);
                  track('lead_respond', { leadId: lead.id });
                },
              }),
            )}
          >
            <p className="rounded-2xl bg-surface-2/60 p-3.5 text-sm leading-relaxed">{lead.description}</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('priceFrom')} error={form.formState.errors.priceFrom?.message}>
                <Input type="number" inputMode="numeric" {...form.register('priceFrom', { valueAsNumber: true })} />
              </Field>
              <Field label={t('priceTo')}>
                <Input type="number" inputMode="numeric" {...form.register('priceTo', { setValueAs: (v: string) => (v === '' || v === null ? null : Number(v)) })} />
              </Field>
              <Field label={t('eta')}>
                <Input type="number" inputMode="numeric" {...form.register('etaMin', { setValueAs: (v: string) => (v === '' || v === null ? null : Number(v)) })} />
              </Field>
            </div>
            <Field label={t('message')} error={form.formState.errors.message?.message}>
              <Textarea placeholder={t('messagePlaceholder')} {...form.register('message')} />
            </Field>
            <Button type="submit" size="lg" loading={respond.isPending}>
              <Send />
              {t('send')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LeadStatusActions({ lead }: { lead: CabinetLead }) {
  const t = useTranslations('cabinet.leads');
  const decline = useCabinetLeadMutation(() => apiCall('declineLead', { params: { id: lead.id }, body: { reason: 'Нет запчасти в наличии' } }), t('declined'));
  const setStatus = useCabinetLeadMutation((status: 'in_progress' | 'completed') => apiCall('setLeadStatus', { params: { id: lead.id }, body: { status } }));
  if (lead.status === 'accepted') {
    return (
      <Button size="sm" variant="soft" loading={setStatus.isPending} onClick={() => setStatus.mutate('in_progress')}>
        <Play />
        {t('start')}
      </Button>
    );
  }
  if (lead.status === 'in_progress') {
    return (
      <Button size="sm" variant="success" loading={setStatus.isPending} onClick={() => setStatus.mutate('completed')}>
        <Flag />
        {t('finish')}
      </Button>
    );
  }
  if (['new', 'viewed', 'responded'].includes(lead.status)) {
    return (
      <div className="flex items-center gap-1.5">
        <RespondDialog lead={lead} />
        {lead.status !== 'responded' ? (
          <Button size="sm" variant="ghost" loading={decline.isPending} onClick={() => decline.mutate(undefined)} aria-label={t('decline')}>
            <X />
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-subtle">
            <Check className="size-3.5" /> {t('waitingClient')}
          </span>
        )}
      </div>
    );
  }
  return null;
}
