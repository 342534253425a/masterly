'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useHydrated } from '@/shared/lib/hooks';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, SegmentedControl } from '@/shared/ui';

const OPTIONS = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
] as const;

export function ThemeToggle() {
  const t = useTranslations('theme');
  const { theme, resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated();
  const Icon = hydrated && resolvedTheme === 'light' ? Sun : Moon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('label')}>
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-44">
        {OPTIONS.map(({ value, icon: OptionIcon }) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)} className={theme === value ? 'bg-accent-soft' : undefined}>
            <OptionIcon />
            {t(value)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeSegmented() {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();
  return (
    <SegmentedControl
      ariaLabel={t('label')}
      value={hydrated ? ((theme as 'light' | 'dark' | 'system') ?? 'system') : 'system'}
      onChange={setTheme}
      options={OPTIONS.map(({ value, icon: OptionIcon }) => ({ value, label: t(value), icon: <OptionIcon /> }))}
    />
  );
}
