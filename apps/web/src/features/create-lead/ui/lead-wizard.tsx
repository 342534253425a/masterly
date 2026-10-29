'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Lead } from '@masterly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, ImagePlus, MessageCircle, Phone, PhoneCall, Send, Users, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { catalogQueries, hueFor, illustrationFor } from '@/entities/catalog';
import { cityQueries, useCurrentCity } from '@/entities/city';
import { useSession } from '@/entities/session';
import { apiCall, errorMessage } from '@/shared/api';
import { routes } from '@/shared/config';
import { useRouter } from '@/shared/i18n';
import { cn, track } from '@/shared/lib';
import { useDebouncedValue } from '@/shared/lib/hooks';
import { Button, Chip, Dialog, DialogContent, DeviceIllustration, DynamicIcon, Field, Input, Switch, Textarea, toast } from '@/shared/ui';
import { useLeadWizard, type LeadPrefill } from '../model/wizard-store';

const schema = z.object({
  brandId: z.string().nullable(),
  modelId: z.string().nullable(),
  serviceId: z.string({ error: 'Выберите услугу' }).min(1, 'Выберите услугу'),
  description: z.string().trim().min(10, 'Опишите проблему хотя бы в паре слов').max(2000),
  urgency: z.enum(['asap', 'today', 'this_week', 'flexible']),
  visitType: z.enum(['workshop', 'onsite', 'courier']),
  preferredChannel: z.enum(['chat', 'call', 'telegram', 'whatsapp']),
  sharePhone: z.boolean(),
  broadcast: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

const STEPS = ['device', 'problem', 'details', 'contact'] as const;
const STEP_FIELDS: Record<(typeof STEPS)[number], Array<keyof FormValues>> = {
  device: ['brandId', 'modelId'],
  problem: ['serviceId', 'description'],
  details: ['urgency', 'visitType'],
  contact: ['preferredChannel', 'sharePhone'],
};

interface Photo {
  id: string;
  url: string;
  uploadId: string | null;
}

/** Загрузка фото через presigned URL: файл идёт напрямую в объектное хранилище, минуя API. */
async function uploadPhoto(file: File): Promise<string> {
  const contentType = (['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const).find((type) => type === file.type) ?? 'image/jpeg';
  const upload = await apiCall('createUpload', { body: { contentType, size: file.size, purpose: 'lead' } });
  await fetch(upload.url, { method: 'PUT', body: file, headers: upload.headers });
  return upload.uploadId;
}

export function LeadWizard({ renderAuth }: { renderAuth: (onSuccess: () => void) => ReactNode }) {
  const { open, prefill, close } = useLeadWizard();
  const t = useTranslations('lead');
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      {open ? (
        <DialogContent size="lg" title={prefill.masterIds?.length ? t('wizardTitle') : t('wizardTitleBroadcast')} description={prefill.masterNames?.join(', ')}>
          <WizardBody key={JSON.stringify(prefill)} prefill={prefill} renderAuth={renderAuth} onClose={close} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function WizardBody({ prefill, renderAuth, onClose }: { prefill: LeadPrefill; renderAuth: (onSuccess: () => void) => ReactNode; onClose: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useSession();
  const { slug: citySlug } = useCurrentCity();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [modelQuery, setModelQuery] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [needAuth, setNeedAuth] = useState(false);
  const [created, setCreated] = useState<Lead | null>(null);
  const debouncedModelQuery = useDebouncedValue(modelQuery, 200);

  const { data: cities } = useQuery(cityQueries.list());
  const { data: brands } = useQuery(catalogQueries.brands());
  const { data: services } = useQuery(catalogQueries.services(citySlug));
  const city = cities?.find((c) => c.slug === citySlug);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      brandId: prefill.brandId ?? null,
      modelId: prefill.modelId ?? null,
      serviceId: prefill.serviceId ?? '',
      description: prefill.description ?? '',
      urgency: prefill.urgent ? 'asap' : 'today',
      visitType: 'workshop',
      preferredChannel: 'chat',
      sharePhone: false,
      broadcast: !prefill.masterIds?.length,
    },
  });
  const values = form.watch();
  const { data: models } = useQuery(catalogQueries.models(values.brandId ?? undefined, debouncedModelQuery));
  const selectedService = services?.find((s) => s.id === values.serviceId);
  const availableServices = useMemo(
    () => services?.filter((s) => !s.brandIds || !values.brandId || s.brandIds.includes(values.brandId)) ?? [],
    [services, values.brandId],
  );

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      apiCall('createLead', {
        body: {
          masterIds: prefill.masterIds ?? [],
          broadcast: data.broadcast,
          cityId: city?.id ?? 'msk',
          serviceId: data.serviceId,
          modelId: data.modelId,
          description: data.description,
          urgency: data.urgency,
          visitType: data.visitType,
          preferredChannel: data.preferredChannel,
          sharePhone: data.sharePhone,
          photoIds: photos.map((p) => p.uploadId).filter((id): id is string => Boolean(id)),
        },
      }),
    onSuccess: (lead) => {
      setCreated(lead);
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
      void queryClient.invalidateQueries({ queryKey: ['cabinet'] });
      track('lead_created', { service: lead.service.id, recipients: lead.recipientsCount });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // После входа отправляем заявку автоматически — пользователь не теряет введённые данные
  useEffect(() => {
    if (needAuth && isAuthenticated) {
      setNeedAuth(false);
      void form.handleSubmit((data) => mutation.mutate(data))();
    }
  }, [needAuth, isAuthenticated, form, mutation]);

  const next = async () => {
    const valid = await form.trigger(STEP_FIELDS[STEPS[step]!]);
    if (!valid) return;
    setDirection(1);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => {
    setDirection(-1);
    setStep((s) => Math.max(0, s - 1));
  };
  const submit = form.handleSubmit((data) => {
    if (!isAuthenticated) {
      setNeedAuth(true);
      return;
    }
    mutation.mutate(data);
  });

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const accepted = [...files].slice(0, 5 - photos.length);
    for (const file of accepted) {
      const id = crypto.randomUUID();
      setPhotos((current) => [...current, { id, url: URL.createObjectURL(file), uploadId: null }]);
      void uploadPhoto(file)
        .then((uploadId) => setPhotos((current) => current.map((p) => (p.id === id ? { ...p, uploadId } : p))))
        .catch(() => toast.error(t('common.errorTitle')));
    }
  };

  if (created) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4 py-6 text-center">
        <motion.span
          initial={{ scale: 0, rotate: -40 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
          className="flex size-20 items-center justify-center rounded-full bg-brand text-white shadow-glow"
        >
          <Check className="size-10" strokeWidth={3} />
        </motion.span>
        <h3 className="text-2xl font-extrabold">{t('lead.successTitle')}</h3>
        <p className="max-w-sm text-sm text-muted">{t('lead.successText')}</p>
        <div className="text-sm text-subtle">{t('orders.recipients', { count: created.recipientsCount })}</div>
        <Button
          size="lg"
          onClick={() => {
            onClose();
            router.push(routes.order(created.id));
          }}
        >
          {t('lead.toLead')}
          <ArrowRight />
        </Button>
      </motion.div>
    );
  }

  if (needAuth) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-accent/25 bg-accent-soft p-4 text-sm">{t('lead.loginRequired')}</div>
        {renderAuth(() => {})}
      </div>
    );
  }

  const current = STEPS[step]!;
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted">
          <span>{t(`lead.steps.${current}`)}</span>
          <span>{t('lead.stepOf', { current: step + 1, total: STEPS.length })}</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {STEPS.map((s, i) => (
            <span key={s} className={cn('h-1.5 rounded-full transition-colors duration-500', i <= step ? 'bg-brand' : 'bg-surface-3')} />
          ))}
        </div>
      </div>

      <div className="relative min-h-[340px] overflow-hidden">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={current}
            custom={direction}
            initial={{ x: direction * 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -40, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="flex flex-col gap-5"
          >
            {current === 'device' ? (
              <>
                <Field label={t('lead.brand')}>
                  <div className="flex flex-wrap gap-2">
                    {brands?.map((brand) => (
                      <Chip
                        key={brand.id}
                        active={values.brandId === brand.id}
                        onClick={() => {
                          form.setValue('brandId', values.brandId === brand.id ? null : brand.id);
                          form.setValue('modelId', null);
                        }}
                      >
                        {brand.name}
                      </Chip>
                    ))}
                  </div>
                </Field>
                <Field label={t('lead.model')}>
                  <Input placeholder={t('lead.modelSearch')} value={modelQuery} onChange={(e) => setModelQuery(e.target.value)} />
                  <div className="mt-1 grid max-h-52 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                    <Chip active={values.modelId === null} onClick={() => form.setValue('modelId', null)} className="justify-start">
                      {t('lead.unknownModel')}
                    </Chip>
                    {models?.map((model) => (
                      <Chip
                        key={model.id}
                        active={values.modelId === model.id}
                        className="justify-start"
                        onClick={() => {
                          form.setValue('modelId', model.id);
                          form.setValue('brandId', model.brandId);
                        }}
                      >
                        {model.fullName}
                      </Chip>
                    ))}
                  </div>
                </Field>
              </>
            ) : null}

            {current === 'problem' ? (
              <>
                <Field label={t('lead.service')} error={form.formState.errors.serviceId?.message}>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {availableServices.map((service) => (
                      <button
                        key={service.id}
                        type="button"
                        aria-pressed={values.serviceId === service.id}
                        onClick={() => form.setValue('serviceId', service.id, { shouldValidate: true })}
                        className={cn(
                          'flex items-center gap-2 rounded-2xl border p-2.5 text-left text-[13px] font-semibold transition-all',
                          values.serviceId === service.id ? 'border-accent/60 bg-accent-soft shadow-[inset_0_0_0_1px_rgb(139_92_246/0.3)]' : 'border-line bg-surface-2/50 hover:border-line-strong',
                        )}
                      >
                        <DynamicIcon name={service.icon} className="size-4 shrink-0 text-accent" />
                        <span className="line-clamp-2">{service.short}</span>
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label={t('lead.description')} htmlFor="lead-description" error={form.formState.errors.description?.message}>
                  <Textarea id="lead-description" placeholder={t('lead.descriptionPlaceholder')} invalid={Boolean(form.formState.errors.description)} {...form.register('description')} />
                </Field>
                <Field label={t('lead.photos')} hint={t('lead.photosHint')}>
                  <div className="flex flex-wrap gap-2">
                    {photos.map((photo) => (
                      <div key={photo.id} className="relative size-20 overflow-hidden rounded-2xl border border-line">
                        {/* eslint-disable-next-line @next/next/no-img-element -- локальное превью blob: */}
                        <img src={photo.url} alt="" className={cn('size-full object-cover transition-opacity', !photo.uploadId && 'opacity-50')} />
                        <button
                          type="button"
                          onClick={() => setPhotos((current) => current.filter((p) => p.id !== photo.id))}
                          className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                          aria-label={t('common.delete')}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                    {photos.length < 5 ? (
                      <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line-strong text-[11px] font-medium text-muted transition hover:border-accent hover:text-accent">
                        <ImagePlus className="size-5" aria-hidden />
                        {t('lead.addPhoto')}
                        <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} />
                      </label>
                    ) : null}
                  </div>
                </Field>
              </>
            ) : null}

            {current === 'details' ? (
              <>
                <Field label={t('lead.urgency')}>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(['asap', 'today', 'this_week', 'flexible'] as const).map((urgency) => (
                      <Chip key={urgency} active={values.urgency === urgency} onClick={() => form.setValue('urgency', urgency)} className="justify-center">
                        {t(`lead.urgencyOptions.${urgency}`)}
                      </Chip>
                    ))}
                  </div>
                </Field>
                <Field label={t('lead.visitType')}>
                  <div className="grid grid-cols-3 gap-2">
                    {(['workshop', 'courier', 'onsite'] as const).map((visit) => (
                      <Chip key={visit} active={values.visitType === visit} onClick={() => form.setValue('visitType', visit)} className="justify-center">
                        {t(`search.visit.${visit}`)}
                      </Chip>
                    ))}
                  </div>
                </Field>
                {selectedService ? (
                  <div className="flex items-center gap-4 rounded-3xl border border-line bg-surface-2/50 p-4">
                    <DeviceIllustration variant={illustrationFor(selectedService.id)} hue={hueFor(selectedService.id)} className="size-20 shrink-0" />
                    <div className="text-sm">
                      <div className="font-bold">{selectedService.name}</div>
                      <div className="mt-1 text-muted">{selectedService.description}</div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {current === 'contact' ? (
              <>
                <Field label={t('lead.channel')}>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['chat', MessageCircle],
                      ['call', PhoneCall],
                      ['telegram', Send],
                      ['whatsapp', Phone],
                    ] as const).map(([channel, Icon]) => (
                      <button
                        key={channel}
                        type="button"
                        aria-pressed={values.preferredChannel === channel}
                        onClick={() => form.setValue('preferredChannel', channel)}
                        className={cn(
                          'flex items-center gap-2.5 rounded-2xl border p-3 text-sm font-semibold transition-all',
                          values.preferredChannel === channel ? 'border-accent/60 bg-accent-soft' : 'border-line bg-surface-2/50 hover:border-line-strong',
                        )}
                      >
                        <Icon className="size-4 text-accent" aria-hidden />
                        {t(`lead.channels.${channel}`)}
                      </button>
                    ))}
                  </div>
                </Field>
                <Controller
                  control={form.control}
                  name="sharePhone"
                  render={({ field }) => (
                    <label className="flex items-start justify-between gap-4 rounded-2xl border border-line p-4">
                      <span>
                        <span className="block text-sm font-semibold">{t('lead.sharePhone')}</span>
                        <span className="mt-0.5 block text-xs text-muted">{t('lead.sharePhoneHint')}</span>
                      </span>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </label>
                  )}
                />
                {prefill.masterIds?.length ? (
                  <Controller
                    control={form.control}
                    name="broadcast"
                    render={({ field }) => (
                      <label className="flex items-start justify-between gap-4 rounded-2xl border border-line p-4">
                        <span className="flex gap-3">
                          <Users className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
                          <span>
                            <span className="block text-sm font-semibold">{t('lead.broadcast')}</span>
                            <span className="mt-0.5 block text-xs text-muted">{t('lead.broadcastHint')}</span>
                          </span>
                        </span>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </label>
                    )}
                  />
                ) : (
                  <div className="flex items-center gap-3 rounded-2xl border border-accent/25 bg-accent-soft p-4 text-sm">
                    <Users className="size-5 shrink-0 text-accent" aria-hidden />
                    {t('lead.recipientsAuto')}
                  </div>
                )}
              </>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        {step > 0 ? (
          <Button variant="ghost" onClick={back}>
            <ArrowLeft />
            {t('common.back')}
          </Button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <Button onClick={() => void next()}>
            {t('common.next')}
            <ArrowRight />
          </Button>
        ) : (
          <Button type="submit" size="lg" loading={mutation.isPending}>
            <Send />
            {t('lead.submit')}
          </Button>
        )}
      </div>
    </form>
  );
}
