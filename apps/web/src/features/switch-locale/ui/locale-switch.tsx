'use client';

import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { routing, usePathname, useRouter, type Locale } from '@/shared/i18n';
import { Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui';

export function LocaleSwitch({ withLabel }: { withLabel?: boolean }) {
  const t = useTranslations('locale');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // usePathname из next-intl уже содержит заполненные динамические сегменты (без префикса локали)
  const change = (next: Locale) =>
    startTransition(() => {
      router.replace(`${pathname}${window.location.search}`, { locale: next });
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={withLabel ? 'secondary' : 'ghost'} size={withLabel ? 'md' : 'icon'} aria-label={t('label')} disabled={isPending}>
          <Languages />
          {withLabel ? t(locale as Locale) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        {routing.locales.map((item) => (
          <DropdownMenuItem key={item} onSelect={() => change(item)} className={item === locale ? 'bg-accent-soft' : undefined}>
            <span className="flex-1">{t(item)}</span>
            {item !== 'ru' ? <Badge size="sm">{tCommon('beta')}</Badge> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
