'use client';

import type { CabinetSchedule } from '@masterly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { cabinetQueries } from '@/entities/master';
import { apiCall, errorMessage } from '@/shared/api';
import { cn } from '@/shared/lib';
import { Button, Card, Chip, Input, SettingRow, Skeleton, Slider, Switch, toast } from '@/shared/ui';

/** График работы, приём заявок (отпуск), радиус выезда и форматы — заявки приходят только когда мастер доступен. */
export function ScheduleEditor() {
  const t = useTranslations('cabinet.schedule');
  const tm = useTranslations('master');
  const ts = useTranslations('search.visit');
  const queryClient = useQueryClient();
  const { data } = useQuery(cabinetQueries.schedule());
  const [draft, setDraft] = useState<CabinetSchedule | null>(null);
  const value = draft ?? data;
  const save = useMutation({
    mutationFn: ({ timezone: _tz, ...body }: CabinetSchedule) => apiCall('updateCabinetSchedule', { body }),
    onSuccess: (result) => {
      queryClient.setQueryData(cabinetQueries.schedule().queryKey, result);
      setDraft(null);
      toast.success(t('saved'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (!value) return <Skeleton className="h-96 rounded-3xl" />;
  const weekdays = tm.raw('weekdays') as string[];
  const set = (patch: Partial<CabinetSchedule>) => setDraft({ ...value, ...patch });
  const setDay = (index: number, day: CabinetSchedule['schedule'][number]) => set({ schedule: value.schedule.map((d, i) => (i === index ? day : d)) });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card className="p-5 sm:p-6">
        <SettingRow title={t('accepting')} description={t('acceptingHint')} control={<Switch checked={value.acceptingLeads} onCheckedChange={(acceptingLeads) => set({ acceptingLeads })} />} />
        <ul className="mt-2 divide-y divide-line">
          {value.schedule.map((day, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3 py-3">
              <span className="w-8 text-sm font-bold">{weekdays[i]}</span>
              <Switch checked={day !== null} onCheckedChange={(on) => setDay(i, on ? { open: '10:00', close: '20:00' } : null)} aria-label={weekdays[i]} />
              {day ? (
                <div className="flex items-center gap-2">
                  <Input type="time" className="h-9 w-28" value={day.open} onChange={(e) => setDay(i, { ...day, open: e.target.value })} />
                  <span className="text-subtle">—</span>
                  <Input type="time" className="h-9 w-28" value={day.close} onChange={(e) => setDay(i, { ...day, close: e.target.value })} />
                </div>
              ) : (
                <span className="text-sm text-subtle">{t('dayOff')}</span>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex flex-col gap-5 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-bold">
          <MapPin className="size-4 text-accent" /> {t('zone')}
        </h2>
        <div className="relative mx-auto flex aspect-square w-full max-w-72 items-center justify-center overflow-hidden rounded-full border border-line bg-[radial-gradient(circle,var(--surface-2),var(--surface))]">
          <div
            className="absolute rounded-full border-2 border-accent/60 bg-accent/15 transition-all duration-500"
            style={{ width: `${Math.min(100, 20 + value.zone.radiusKm * 3)}%`, height: `${Math.min(100, 20 + value.zone.radiusKm * 3)}%` }}
          />
          <span className="relative flex size-4 items-center justify-center">
            <span className="absolute size-full animate-pulse-ring rounded-full bg-accent" />
            <span className="relative size-3 rounded-full border-2 border-white bg-accent" />
          </span>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold">{t('radius', { value: value.zone.radiusKm })}</div>
          <Slider min={1} max={30} step={1} value={[value.zone.radiusKm]} onValueChange={([radiusKm]) => set({ zone: { ...value.zone, radiusKm: radiusKm ?? 5 } })} />
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold">{t('visitTypes')}</div>
          <div className="flex flex-wrap gap-2">
            {(['workshop', 'courier', 'onsite'] as const).map((visit) => {
              const active = value.zone.visitTypes.includes(visit);
              return (
                <Chip
                  key={visit}
                  active={active}
                  onClick={() =>
                    set({ zone: { ...value.zone, visitTypes: active ? value.zone.visitTypes.filter((v) => v !== visit) : [...value.zone.visitTypes, visit] } })
                  }
                >
                  {ts(visit)}
                </Chip>
              );
            })}
          </div>
        </div>
        <Button size="lg" className={cn('mt-auto')} disabled={!draft || value.zone.visitTypes.length === 0} loading={save.isPending} onClick={() => draft && save.mutate(draft)}>
          <Save />
          {t('save')}
        </Button>
      </Card>
    </div>
  );
}
