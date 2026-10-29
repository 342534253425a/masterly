'use client';

import type { CabinetOffer } from '@masterly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, TrendingDown, TrendingUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { catalogQueries, hueFor, illustrationFor } from '@/entities/catalog';
import { cabinetQueries } from '@/entities/master';
import { apiCall, errorMessage } from '@/shared/api';
import { cn, formatPrice } from '@/shared/lib';
import { Button, Card, DeviceIllustration, Input, Skeleton, Switch, toast } from '@/shared/ui';

/** Редактор услуг и цен: сравнение с медианой рынка, отключение услуг, сроки и гарантия. */
export function OffersEditor() {
  const t = useTranslations('cabinet.services');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { data } = useQuery(cabinetQueries.offers());
  const { data: services } = useQuery(catalogQueries.services());
  const [draft, setDraft] = useState<CabinetOffer[] | null>(null);
  const offers = draft ?? data;
  const save = useMutation({
    mutationFn: (items: CabinetOffer[]) => apiCall('updateCabinetOffers', { body: { offers: items.map(({ marketMedian: _m, ...rest }) => rest) } }),
    onSuccess: (result) => {
      queryClient.setQueryData(cabinetQueries.offers().queryKey, result);
      setDraft(null);
      toast.success(t('saved'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (!offers) return <Skeleton className="h-96 rounded-3xl" />;
  const patch = (serviceId: string, change: Partial<CabinetOffer>) => setDraft(offers.map((offer) => (offer.serviceId === serviceId ? { ...offer, ...change } : offer)));

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {offers.map((offer) => {
            const service = services?.find((s) => s.id === offer.serviceId);
            const diff = offer.marketMedian ? (offer.priceFrom - offer.marketMedian) / offer.marketMedian : 0;
            return (
              <li key={offer.serviceId} className={cn('grid gap-3 p-4 transition-opacity sm:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))_auto] sm:items-center sm:px-5', !offer.enabled && 'opacity-50')}>
                <div className="flex items-center gap-3">
                  <DeviceIllustration variant={illustrationFor(offer.serviceId)} hue={hueFor(offer.serviceId)} className="size-11 shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{service?.name ?? offer.serviceId}</div>
                    {offer.marketMedian ? (
                      <div className={cn('mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold', diff > 0.05 ? 'text-warning' : diff < -0.05 ? 'text-success' : 'text-subtle')}>
                        {diff > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                        {t('market', { price: formatPrice(offer.marketMedian, locale) })} · {Math.abs(Math.round(diff * 100))}% {diff > 0 ? t('above') : t('below')}
                      </div>
                    ) : null}
                  </div>
                </div>
                <label className="text-xs text-subtle">
                  {t('priceFrom')}
                  <Input type="number" className="mt-1 h-9" value={offer.priceFrom} onChange={(e) => patch(offer.serviceId, { priceFrom: Number(e.target.value) })} />
                </label>
                <label className="text-xs text-subtle">
                  {t('priceTo')}
                  <Input type="number" className="mt-1 h-9" value={offer.priceTo} onChange={(e) => patch(offer.serviceId, { priceTo: Number(e.target.value) })} />
                </label>
                <label className="text-xs text-subtle">
                  {t('duration')}
                  <Input type="number" className="mt-1 h-9" value={offer.durationMin} onChange={(e) => patch(offer.serviceId, { durationMin: Number(e.target.value) })} />
                </label>
                <label className="text-xs text-subtle">
                  {t('warranty')}
                  <Input type="number" className="mt-1 h-9" value={offer.warrantyDays} onChange={(e) => patch(offer.serviceId, { warrantyDays: Number(e.target.value) })} />
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-muted sm:flex-col sm:gap-1">
                  {t('enabled')}
                  <Switch checked={offer.enabled} onCheckedChange={(enabled) => patch(offer.serviceId, { enabled })} />
                </label>
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="sticky bottom-24 z-10 flex items-center justify-end gap-3 lg:bottom-4">
        {draft ? <span className="glass rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-warning">{t('unsaved')}</span> : null}
        <Button size="lg" disabled={!draft} loading={save.isPending} onClick={() => draft && save.mutate(draft)}>
          <Save />
          {t('save')}
        </Button>
      </div>
    </div>
  );
}
