'use client';

import type { Role } from '@masterly/contracts';
import { ShieldCheck, UserRound, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib';
import { toast } from '@/shared/ui';
import { useDemoLogin } from '../model/use-auth';

const ROLES: Array<{ role: Role; icon: typeof UserRound; hint: string; hue: number }> = [
  { role: 'client', icon: UserRound, hint: 'Поиск, заявки, чат, избранное', hue: 268 },
  { role: 'master', icon: Wrench, hint: 'Кабинет: заявки, цены, аналитика', hue: 205 },
  { role: 'admin', icon: ShieldCheck, hint: 'Модерация, антифрод, каталог', hue: 330 },
];

/** Быстрый вход в демо-аккаунты: портфолио можно посмотреть глазами каждой роли. */
export function DemoRoleSwitcher({ onDone, activeRole, compact }: { onDone?: (role: Role) => void; activeRole?: Role | null; compact?: boolean }) {
  const t = useTranslations('nav');
  const tAuth = useTranslations('auth');
  const login = useDemoLogin();
  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3')}>
      {ROLES.map(({ role, icon: Icon, hint, hue }) => {
        const active = activeRole === role;
        return (
          <button
            key={role}
            type="button"
            disabled={login.isPending}
            onClick={() =>
              login.mutate(role, {
                onSuccess: (session) => {
                  toast.success(tAuth('welcome', { name: session.user?.name ?? '' }));
                  onDone?.(role);
                },
              })
            }
            className={cn(
              'group flex items-center gap-3 rounded-2xl border p-3 text-left transition-all duration-200 disabled:opacity-60',
              compact && 'flex-col gap-1.5 p-2.5 text-center',
              active ? 'border-accent/50 bg-accent-soft' : 'border-line bg-surface-2/50 hover:border-line-strong hover:bg-surface-2',
            )}
          >
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-lg transition-transform group-hover:scale-105"
              style={{ backgroundImage: `linear-gradient(135deg, hsl(${hue} 85% 62%), hsl(${hue + 35} 80% 48%))` }}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">{t(`roles.${role}`)}</span>
              {compact ? null : <span className="block text-xs text-muted">{hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
