'use client';

import type { Category } from '@masterly/contracts';
import { Bell, BellRing } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { cn, formatNumber, track } from '@/shared/lib';
import { useHydrated } from '@/shared/lib/hooks';
import { Button, Container, DynamicIcon, SectionHeader, toast } from '@/shared/ui';

const useWaitlist = create<{ ids: string[]; toggle: (id: string) => void }>()(
  persist((set) => ({ ids: [], toggle: (id) => set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id] })) }), {
    name: 'mly-waitlist',
    storage: createJSONStorage(() => localStorage),
  }),
);

/** Будущие вертикали: лист ожидания — сигнал спроса для запуска новых категорий. */
export function ComingSoon({ categories }: { categories: Category[] }) {
  const t = useTranslations('home.soon');
  const locale = useLocale();
  const hydrated = useHydrated();
  const { ids, toggle } = useWaitlist();
  const soon = categories.filter((c) => c.status === 'soon');
  return (
    <section>
      <Container>
        <SectionHeader title={t('title')} description={t('text')} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {soon.map((category, i) => {
            const subscribed = hydrated && ids.includes(category.id);
            return (
              <div key={category.id} className="group flex flex-col gap-3 rounded-3xl border border-line bg-surface/70 p-4 transition hover:border-line-strong">
                <span
                  className="flex size-11 items-center justify-center rounded-2xl text-white shadow-lg transition-transform duration-300 group-hover:scale-110"
                  style={{ backgroundImage: `linear-gradient(135deg, hsl(${200 + i * 22} 80% 60%), hsl(${240 + i * 22} 70% 45%))` }}
                >
                  <DynamicIcon name={category.icon} className="size-5" />
                </span>
                <div>
                  <div className="text-sm font-bold">{category.name}</div>
                  <div className="mt-0.5 text-xs text-subtle">{t('waitlist', { count: formatNumber(category.waitlist + (subscribed ? 1 : 0), locale) })}</div>
                </div>
                <Button
                  size="xs"
                  variant={subscribed ? 'soft' : 'secondary'}
                  className={cn('mt-auto', subscribed && 'text-accent')}
                  onClick={() => {
                    toggle(category.id);
                    if (!subscribed) {
                      toast.success(t('subscribed'));
                      track('waitlist_join', { category: category.id });
                    }
                  }}
                >
                  {subscribed ? <BellRing /> : <Bell />}
                  {subscribed ? t('subscribed') : t('notify')}
                </Button>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
