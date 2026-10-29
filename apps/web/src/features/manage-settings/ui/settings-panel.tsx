'use client';

import type { Settings, UpdateSettings } from '@masterly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Download, Lock, Palette, Search, Trash, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { cityQueries } from '@/entities/city';
import { useSession } from '@/entities/session';
import { apiCall, errorMessage } from '@/shared/api';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { formatDate, setAnalyticsConsent } from '@/shared/lib';
import { Badge, Button, buttonVariants, Card, Checkbox, Dialog, DialogContent, Input, SegmentedControl, SettingRow, Slider, Switch, toast } from '@/shared/ui';
import { usePreferences } from '../model/preferences';
import { PushToggle } from './push-toggle';

const SETTINGS_KEY = ['settings'] as const;
const EVENTS = ['leads', 'messages', 'reviews', 'digest', 'promotions'] as const;
const CHANNELS = ['push', 'email', 'sms', 'telegram'] as const;

function Section({ icon, title, children }: { icon: ReactNode; title: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-2 flex items-center gap-2.5 text-base font-bold">
        <span className="flex size-8 items-center justify-center rounded-xl bg-accent-soft text-accent [&_svg]:size-4 dark:text-accent-2">{icon}</span>
        {title}
      </h2>
      <div className="divide-y divide-line">{children}</div>
    </Card>
  );
}

/** Настройки клиента: уведомления и тихие часы, согласия (152-ФЗ), экспорт и удаление данных, доступность. */
export function SettingsPanel({ appearance }: { appearance: ReactNode }) {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { user, isAuthenticated } = useSession();
  const queryClient = useQueryClient();
  const prefs = usePreferences();
  const { data: settings } = useQuery({ queryKey: SETTINGS_KEY, queryFn: ({ signal }) => apiCall('settings', {}, { signal }), enabled: isAuthenticated });
  const { data: cities } = useQuery(cityQueries.list());
  const [deletion, setDeletion] = useState<{ scheduledAt: string; retained: Array<{ data: string; until: string; basis: string }> } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = useMutation({
    mutationFn: (patch: UpdateSettings) => apiCall('updateSettings', { body: patch }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY });
      const previous = queryClient.getQueryData<Settings>(SETTINGS_KEY);
      if (previous) queryClient.setQueryData<Settings>(SETTINGS_KEY, { ...previous, ...patch });
      return { previous };
    },
    onError: (error, _patch, context) => {
      queryClient.setQueryData(SETTINGS_KEY, context?.previous);
      toast.error(errorMessage(error));
    },
    onSuccess: () => toast.success(tCommon('saved')),
  });

  const exportData = useMutation({
    mutationFn: () => apiCall('exportData', {}),
    onSuccess: (data) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const anchor = Object.assign(document.createElement('a'), { href: url, download: `masterly-data-${new Date().toISOString().slice(0, 10)}.json` });
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(t('privacy.exportDone'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const deleteAccount = useMutation({
    mutationFn: () => apiCall('deleteAccount', {}),
    onSuccess: (result) => {
      setConfirmDelete(false);
      setDeletion(result);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const setPreference = <K extends 'reducedMotion' | 'largeText' | 'highContrast'>(key: K, value: boolean) => {
    prefs.setPreference(key, value);
    if (settings) update.mutate({ accessibility: { ...settings.accessibility, [key]: value } });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {isAuthenticated && user ? (
        <Section icon={<UserRound />} title={t('sections.account')}>
          <SettingRow title={user.name} description={t('account.since', { date: formatDate(user.createdAt, locale, { month: 'long', year: 'numeric' }) })} control={<Badge tone="accent">{user.activeRole}</Badge>} />
          <SettingRow title={t('account.phone')} control={<span className="text-sm font-semibold">{user.phoneMasked}</span>} />
          <SettingRow title={t('account.email')} control={<span className="text-sm text-muted">{user.email ?? '—'}</span>} />
        </Section>
      ) : (
        <Card className="flex flex-col items-start gap-3 p-6">
          <h2 className="text-lg font-bold">{t('loginTitle')}</h2>
          <p className="text-sm text-muted">{t('loginText')}</p>
          <Link href={routes.login(routes.profile())} className={buttonVariants()}>
            {t('loginTitle')}
          </Link>
        </Card>
      )}

      <Section icon={<Palette />} title={t('sections.interface')}>
        <div className="py-3.5">{appearance}</div>
        <SettingRow title={t('interface.reducedMotion')} description={t('interface.reducedMotionHint')} control={<Switch checked={prefs.reducedMotion} onCheckedChange={(v) => setPreference('reducedMotion', v)} />} />
        <SettingRow title={t('interface.largeText')} description={t('interface.largeTextHint')} control={<Switch checked={prefs.largeText} onCheckedChange={(v) => setPreference('largeText', v)} />} />
        <SettingRow title={t('interface.highContrast')} description={t('interface.highContrastHint')} control={<Switch checked={prefs.highContrast} onCheckedChange={(v) => setPreference('highContrast', v)} />} />
      </Section>

      {settings ? (
        <>
          <Section icon={<Bell />} title={t('sections.notifications')}>
            <div className="overflow-x-auto py-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-subtle">
                    <th className="pb-2 text-left font-semibold" />
                    {CHANNELS.map((channel) => (
                      <th key={channel} className="pb-2 font-semibold">
                        {t(`notifications.channels.${channel}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {EVENTS.map((event) => (
                    <tr key={event} className="border-t border-line">
                      <td className="py-2.5 pr-3 font-medium">{t(`notifications.events.${event}`)}</td>
                      {CHANNELS.map((channel) => {
                        const enabled = settings.notifications[event].includes(channel);
                        return (
                          <td key={channel} className="py-2.5 text-center">
                            <Checkbox
                              checked={enabled}
                              aria-label={`${t(`notifications.events.${event}`)}: ${t(`notifications.channels.${channel}`)}`}
                              onCheckedChange={(checked) =>
                                update.mutate({
                                  notifications: {
                                    ...settings.notifications,
                                    [event]: checked ? [...settings.notifications[event], channel] : settings.notifications[event].filter((c) => c !== channel),
                                  },
                                })
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PushToggle />
            <SettingRow
              title={t('notifications.quietHours')}
              description={t('notifications.quietHoursHint')}
              control={<Switch checked={settings.quietHours.enabled} onCheckedChange={(enabled) => update.mutate({ quietHours: { ...settings.quietHours, enabled } })} />}
            />
            {settings.quietHours.enabled ? (
              <div className="flex items-center gap-3 py-3 text-sm">
                {t('notifications.from')}
                <Input type="time" className="h-9 w-28" value={settings.quietHours.start} onChange={(e) => update.mutate({ quietHours: { ...settings.quietHours, start: e.target.value } })} />
                {t('notifications.to')}
                <Input type="time" className="h-9 w-28" value={settings.quietHours.end} onChange={(e) => update.mutate({ quietHours: { ...settings.quietHours, end: e.target.value } })} />
              </div>
            ) : null}
          </Section>

          <Section icon={<Search />} title={t('sections.search')}>
            <div className="py-3.5">
              <div className="mb-2 text-sm font-semibold">{t('search.city')}</div>
              <div className="flex flex-wrap gap-2">
                {cities?.map((city) => (
                  <Button key={city.id} size="sm" variant={settings.cityId === city.id ? 'soft' : 'secondary'} onClick={() => update.mutate({ cityId: city.id })}>
                    {city.name}
                  </Button>
                ))}
              </div>
            </div>
            <div className="py-3.5">
              <div className="mb-3 text-sm font-semibold">{t('search.radius', { value: settings.radiusKm })}</div>
              <Slider min={1} max={50} step={1} value={[settings.radiusKm]} onValueCommit={([radiusKm]) => radiusKm && update.mutate({ radiusKm })} />
            </div>
            <SettingRow
              title={t('search.geolocation')}
              control={
                <SegmentedControl
                  size="sm"
                  value={settings.geolocation}
                  onChange={(geolocation) => update.mutate({ geolocation })}
                  options={(['ask', 'allow', 'deny'] as const).map((value) => ({ value, label: t(`search.geo.${value}`) }))}
                />
              }
            />
            <div className="py-3.5">
              <div className="mb-2 text-sm font-semibold">{t('search.savedFilters')}</div>
              {settings.savedFilters.length === 0 ? <p className="text-sm text-muted">{t('search.noSavedFilters')}</p> : null}
              {settings.savedFilters.map((filter) => (
                <div key={filter.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="truncate text-sm">{filter.name}</span>
                  <Link href={routes.search(filter.query)} className={buttonVariants({ variant: 'secondary', size: 'xs' })}>
                    {t('search.open')}
                  </Link>
                </div>
              ))}
            </div>
          </Section>

          <Section icon={<Lock />} title={t('sections.privacy')}>
            {(['analytics', 'personalization', 'marketing'] as const).map((consent) => (
              <SettingRow
                key={consent}
                title={t(`privacy.${consent}`)}
                description={t(`privacy.${consent}Hint`)}
                control={
                  <Switch
                    checked={settings.consents[consent]}
                    onCheckedChange={(granted) => {
                      if (consent === 'analytics') setAnalyticsConsent(granted);
                      update.mutate({ consents: { ...settings.consents, [consent]: granted } });
                    }}
                  />
                }
              />
            ))}
            <SettingRow
              title={t('privacy.export')}
              description={t('privacy.exportHint')}
              control={
                <Button variant="secondary" size="sm" loading={exportData.isPending} onClick={() => exportData.mutate()}>
                  <Download />
                  JSON
                </Button>
              }
            />
            <SettingRow
              title={<span className="text-danger">{t('privacy.delete')}</span>}
              description={t('privacy.deleteHint')}
              control={
                <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirmDelete(true)}>
                  <Trash />
                </Button>
              }
            />
            {deletion ? (
              <div className="rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm">
                <div className="font-semibold">{t('privacy.deleteScheduled', { date: formatDate(deletion.scheduledAt, locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}</div>
                <div className="mt-2 text-xs font-semibold text-muted">{t('privacy.retained')}:</div>
                <ul className="mt-1 space-y-1 text-xs text-muted">
                  {deletion.retained.map((item) => (
                    <li key={item.data}>
                      • {item.data} — до {formatDate(item.until, locale, { month: 'long', year: 'numeric' })} ({item.basis})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Section>
        </>
      ) : null}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          size="sm"
          title={t('privacy.deleteConfirm')}
          description={t('privacy.deleteHint')}
          footer={
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)}>
                {tCommon('cancel')}
              </Button>
              <Button variant="danger" className="flex-1" loading={deleteAccount.isPending} onClick={() => deleteAccount.mutate()}>
                {t('privacy.delete')}
              </Button>
            </div>
          }
        />

      </Dialog>
    </div>
  );
}
