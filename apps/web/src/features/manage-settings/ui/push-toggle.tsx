'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { apiCall, errorMessage } from '@/shared/api';
import { SettingRow, Switch, toast } from '@/shared/ui';

type State = 'loading' | 'unsupported' | 'disabled' | 'blocked' | 'off' | 'on';

/** Публичный VAPID-ключ (base64url) → BufferSource для PushManager.subscribe. */
function applicationServerKey(publicKey: string): Uint8Array<ArrayBuffer> {
  const base64 = (publicKey + '='.repeat((4 - (publicKey.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const registration = () => ('serviceWorker' in navigator ? navigator.serviceWorker.getRegistration() : Promise.resolve(undefined));

/**
 * Push в этом браузере: подписка PWA через сервис-воркер (Web Push, VAPID). Подписка — на устройство,
 * поэтому переключатель отдельный от таблицы каналов: та решает, о чём сообщать, этот — сюда ли.
 */
export function PushToggle() {
  const t = useTranslations('settings.notifications.push');
  const { data: config } = useQuery({ queryKey: ['push-config'], queryFn: ({ signal }) => apiCall('pushConfig', {}, { signal }), staleTime: 60 * 60_000 });
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    void (async () => {
      const worker = await registration();
      const next: State = !config.enabled ? 'disabled' : !worker || !('PushManager' in window) ? 'unsupported' : Notification.permission === 'denied' ? 'blocked' : (await worker.pushManager.getSubscription()) ? 'on' : 'off';
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [config]);

  const toggle = async (enable: boolean) => {
    const worker = await registration();
    if (!worker || !config?.publicKey) return;
    setBusy(true);
    try {
      if (enable) {
        if ((await Notification.requestPermission()) !== 'granted') {
          setState('blocked');
          return;
        }
        const subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(config.publicKey) });
        const { endpoint, keys } = subscription.toJSON();
        await apiCall('pushSubscribe', { body: { endpoint: endpoint!, keys: { p256dh: keys!.p256dh!, auth: keys!.auth! } } });
        setState('on');
      } else {
        const subscription = await worker.pushManager.getSubscription();
        if (subscription) {
          await apiCall('pushUnsubscribe', { query: { endpoint: subscription.endpoint } });
          await subscription.unsubscribe();
        }
        setState('off');
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const hint = state === 'disabled' || state === 'unsupported' || state === 'blocked' ? t(state) : t('hint');
  return (
    <SettingRow
      title={t('title')}
      description={hint}
      control={<Switch checked={state === 'on'} disabled={busy || (state !== 'on' && state !== 'off')} onCheckedChange={(checked) => void toggle(checked)} />}
    />
  );
}
