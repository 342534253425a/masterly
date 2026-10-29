'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { useEffect, type ReactNode } from 'react';
import { usePreferences } from '@/features/manage-settings';
import { CityProvider } from '@/entities/city';
import { getQueryClient } from '@/shared/api';
import { Toaster, TooltipProvider } from '@/shared/ui';
import { RealtimeSync } from './realtime-sync';

/** Применяет настройки доступности к <html>: сниженная анимация, крупный текст, высокий контраст. */
function PreferencesSync() {
  const { reducedMotion, largeText, highContrast } = usePreferences();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = reducedMotion ? 'reduced' : 'full';
    root.dataset.text = largeText ? 'large' : 'normal';
    root.dataset.contrast = highContrast ? 'high' : 'normal';
  }, [reducedMotion, largeText, highContrast]);
  return null;
}

/** PWA: сервис-воркер только в production — в dev он мешал бы HMR. */
function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }, []);
  return null;
}

export function AppProviders({ children, initialCity, realtimeUrl = null }: { children: ReactNode; initialCity: string; realtimeUrl?: string | null }) {
  const queryClient = getQueryClient();
  const reducedMotion = usePreferences((s) => s.reducedMotion);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        <NuqsAdapter>
          <CityProvider initialCity={initialCity}>
            <TooltipProvider delayDuration={250}>
              <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
                <PreferencesSync />
                <ServiceWorkerRegistrar />
                <RealtimeSync url={realtimeUrl} />
                {children}
                <Toaster />
              </MotionConfig>
            </TooltipProvider>
          </CityProvider>
        </NuqsAdapter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
