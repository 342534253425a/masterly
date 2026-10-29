'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { RequestInvoice } from '@masterly/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { cabinetQueries } from '@/entities/master';
import { apiCall, errorMessage } from '@/shared/api';
import { cn } from '@/shared/lib';
import { Button, Dialog, DialogContent, Field, Input, toast } from '@/shared/ui';

type Values = z.input<typeof RequestInvoice>;

/** Платные возможности — только по внешнему счёту (ИП/ООО/самозанятый): на сайте нет платёжного интерфейса. */
export function InvoiceDialog({ defaultProduct = 'pro_month' }: { defaultProduct?: Values['product'] }) {
  const t = useTranslations('cabinet.billing');
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const form = useForm<Values>({ resolver: zodResolver(RequestInvoice), defaultValues: { product: defaultProduct, payer: '', inn: '', email: '' } });
  const product = form.watch('product');
  const request = useMutation({
    mutationFn: (values: Values) => apiCall('requestInvoice', { body: values }),
    onSuccess: (invoice) => {
      toast.success(t('issued', { number: invoice.number }));
      setOpen(false);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: cabinetQueries.billing().queryKey });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <FileText />
        {t('requestInvoice')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('requestTitle')} description={t('noPayments')}>
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((values) => request.mutate(values))}>
            <Field label={t('product')}>
              <div className="flex flex-col gap-2" role="radiogroup">
                {(['pro_month', 'pro_year', 'promotion_week'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={product === value}
                    onClick={() => form.setValue('product', value)}
                    className={cn('rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition', product === value ? 'border-accent/60 bg-accent-soft' : 'border-line hover:border-line-strong')}
                  >
                    {t(`products.${value}`)}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t('payer')} error={form.formState.errors.payer?.message}>
              <Input {...form.register('payer')} placeholder="ИП Иванов Иван Иванович" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('inn')} error={form.formState.errors.inn?.message}>
                <Input inputMode="numeric" {...form.register('inn')} placeholder="7701234567" />
              </Field>
              <Field label={t('email')} error={form.formState.errors.email?.message}>
                <Input type="email" {...form.register('email')} placeholder="buh@service.ru" />
              </Field>
            </div>
            <Button type="submit" size="lg" loading={request.isPending}>
              {t('send')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
