'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { UpdateProfile, type MasterProfile } from '@masterly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, ImagePlus, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { catalogQueries, hueFor, illustrationFor } from '@/entities/catalog';
import { cabinetQueries } from '@/entities/master';
import { apiCall, errorMessage } from '@/shared/api';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { Badge, Button, buttonVariants, Card, Chip, DeviceIllustration, Field, Input, Skeleton, Switch, Textarea, toast } from '@/shared/ui';

type Values = z.input<typeof UpdateProfile>;

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function Form({ profile }: { profile: MasterProfile }) {
  const t = useTranslations('cabinet.profile');
  const tm = useTranslations('master');
  const ts = useTranslations('search');
  const queryClient = useQueryClient();
  const { data: brands } = useQuery(catalogQueries.brands());
  const [uploads, setUploads] = useState<string[]>([]);
  const form = useForm<Values>({
    resolver: zodResolver(UpdateProfile),
    defaultValues: {
      name: profile.name,
      tagline: profile.tagline,
      about: profile.about,
      address: profile.address,
      telegram: null,
      brandIds: profile.brandIds,
      visitTypes: profile.visitTypes,
      paymentMethods: profile.paymentMethods,
      partsQualities: profile.partsQualities,
      warrantyDays: profile.warrantyDays,
      express: profile.express,
    },
  });
  const save = useMutation({
    mutationFn: (values: Values) => apiCall('updateCabinetProfile', { body: values }),
    onSuccess: (result) => {
      queryClient.setQueryData(cabinetQueries.profile().queryKey, result);
      toast.success(t('saved'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const values = form.watch();

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <Field label={t('name')} error={form.formState.errors.name?.message}>
          <Input {...form.register('name')} />
        </Field>
        <Field label={t('tagline')}>
          <Input {...form.register('tagline')} />
        </Field>
        <Field label={t('about')}>
          <Textarea className="min-h-36" {...form.register('about')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('address')}>
            <Input {...form.register('address')} />
          </Field>
          <Field label={t('warranty')}>
            <Input type="number" {...form.register('warrantyDays', { valueAsNumber: true })} />
          </Field>
        </div>
        <Controller
          control={form.control}
          name="express"
          render={({ field }) => (
            <label className="flex items-center justify-between rounded-2xl border border-line p-4 text-sm font-semibold">
              {t('express')}
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </label>
          )}
        />
      </Card>
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <Field label={t('brands')} error={form.formState.errors.brandIds?.message}>
            <div className="flex flex-wrap gap-1.5">
              {brands?.map((brand) => (
                <Chip key={brand.id} size="sm" active={values.brandIds.includes(brand.id)} onClick={() => form.setValue('brandIds', toggle(values.brandIds, brand.id))}>
                  {brand.name}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label={t('visitTypes')}>
            <div className="flex flex-wrap gap-1.5">
              {(['workshop', 'courier', 'onsite'] as const).map((visit) => (
                <Chip key={visit} size="sm" active={values.visitTypes.includes(visit)} onClick={() => form.setValue('visitTypes', toggle(values.visitTypes, visit))}>
                  {ts(`visit.${visit}`)}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label={t('payment')}>
            <div className="flex flex-wrap gap-1.5">
              {(['cash', 'card', 'sbp'] as const).map((method) => (
                <Chip key={method} size="sm" active={values.paymentMethods.includes(method)} onClick={() => form.setValue('paymentMethods', toggle(values.paymentMethods, method))}>
                  {tm(`payment.${method}`)}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label={t('parts')}>
            <div className="flex flex-wrap gap-1.5">
              {(['original', 'oem', 'copy'] as const).map((parts) => (
                <Chip key={parts} size="sm" active={values.partsQualities.includes(parts)} onClick={() => form.setValue('partsQualities', toggle(values.partsQualities, parts))}>
                  {ts(`parts.${parts}`)}
                </Chip>
              ))}
            </div>
          </Field>
        </Card>
        <Card className="p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold">{t('photos')}</span>
            <label className={buttonVariants({ variant: 'secondary', size: 'xs' })}>
              <ImagePlus />
              {t('uploadPhoto')}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && setUploads([...uploads, URL.createObjectURL(e.target.files[0])])} />
            </label>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {uploads.map((url) => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- локальное превью */}
                <img src={url} alt="" className="size-full object-cover" />
                <Badge tone="warning" size="sm" className="absolute bottom-1 left-1">
                  {t('photoModeration')}
                </Badge>
              </div>
            ))}
            {profile.photos.slice(0, 8 - uploads.length).map((photo) => (
              <div key={photo.id} className="aspect-square rounded-xl border border-line bg-surface-2 p-1.5" title={photo.caption}>
                <DeviceIllustration variant={illustrationFor(photo.serviceId)} hue={hueFor(photo.serviceId)} className="size-full" />
              </div>
            ))}
          </div>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="lg" className="flex-1" loading={save.isPending}>
            <Save />
            {t('save')}
          </Button>
          <Link href={routes.master(profile.slug)} className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
            <ExternalLink />
            {t('preview')}
          </Link>
        </div>
      </div>
    </form>
  );
}

export function ProfileForm() {
  const { data } = useQuery(cabinetQueries.profile());
  if (!data) return <Skeleton className="h-[520px] rounded-3xl" />;
  return <Form profile={data} />;
}
