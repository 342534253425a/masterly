'use client';

import { ArrowRight, GitCompareArrows, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { cn, track } from '@/shared/lib';
import { useHydrated } from '@/shared/lib/hooks';
import { Avatar, Button, buttonVariants, toast } from '@/shared/ui';
import { useCompare, type CompareEntry } from '../model/compare-store';

export function CompareToggle({ master, withLabel, className }: { master: CompareEntry; withLabel?: boolean; className?: string }) {
  const t = useTranslations('compare');
  const tm = useTranslations('master');
  const hydrated = useHydrated();
  const toggle = useCompare((s) => s.toggle);
  const active = useCompare((s) => s.items.some((item) => item.id === master.id)) && hydrated;
  return (
    <Button
      variant={withLabel ? 'secondary' : 'ghost'}
      size={withLabel ? 'md' : 'icon-sm'}
      aria-pressed={active}
      aria-label={active ? tm('inCompare') : tm('compare')}
      className={cn(active && 'text-accent dark:text-accent-2', className)}
      onClick={() => {
        const wasActive = active;
        if (!toggle({ id: master.id, name: master.name, initials: master.initials, hue: master.hue })) {
          toast.error(t('maxReached'));
          return;
        }
        if (!wasActive) {
          toast.success(t('added'));
          track('compare_add', { masterId: master.id });
        }
      }}
    >
      <GitCompareArrows />
      {withLabel ? (active ? tm('inCompare') : tm('compare')) : null}
    </Button>
  );
}

/** Плавающая панель сравнения — появляется, когда выбран хотя бы один мастер. */
export function CompareTray() {
  const t = useTranslations('compare');
  const hydrated = useHydrated();
  const { items, remove, clear } = useCompare();
  const visible = hydrated && items.length > 0;
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 mx-auto max-w-xl lg:bottom-6 lg:left-[calc(var(--sidebar-width)+1.5rem)] lg:right-6"
        >
          <div className="glass flex items-center gap-3 rounded-3xl border border-line-strong p-2.5 pl-3 shadow-float">
            <div className="flex -space-x-2">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <motion.button
                    key={item.id}
                    layout
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    type="button"
                    onClick={() => remove(item.id)}
                    className="group relative rounded-full ring-2 ring-[var(--elevated)]"
                    aria-label={`${t('remove')}: ${item.name}`}
                    title={item.name}
                  >
                    <Avatar initials={item.initials} hue={item.hue} size="md" />
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
                      <X className="size-4 text-white" />
                    </span>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
            <div className="min-w-0 flex-1 text-xs text-muted">
              <span className="hidden sm:inline">{t('subtitle')}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={clear}>
              {t('clear')}
            </Button>
            <Link href={routes.compare({ ids: items.map((item) => item.id).join(',') })} className={buttonVariants({ size: 'md' })}>
              {t('tray', { count: items.length })}
              <ArrowRight />
            </Link>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
