'use client';

import { FlaskConical, LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DemoRoleSwitcher } from '@/features/auth';
import { SmartSearch } from '@/features/search-by-problem';
import { CitySelect } from '@/features/select-city';
import { LocaleSwitch } from '@/features/switch-locale';
import { ThemeToggle } from '@/features/toggle-theme';
import { UserAvatar, useSession } from '@/entities/session';
import { routes } from '@/shared/config';
import { Link, usePathname, useRouter } from '@/shared/i18n';
import { cn } from '@/shared/lib';
import { Button, buttonVariants, LogoMark, Popover, PopoverContent, PopoverTrigger } from '@/shared/ui';
import { NotificationsBell } from './notifications-bell';

export function Topbar() {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, isAuthenticated } = useSession();
  const isHome = pathname === '/';

  return (
    <header className="glass sticky top-0 z-30 border-b border-line/70">
      <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <Link href={routes.home()} className="lg:hidden" aria-label="Masterly">
          <LogoMark className="size-8" />
        </Link>

        {!isHome ? (
          <div className="hidden max-w-xl flex-1 md:block">
            <SmartSearch variant="compact" />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        {!isHome ? <div className="flex-1 md:hidden" /> : null}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="soft" size="sm" className="hidden rounded-full sm:inline-flex">
              <FlaskConical />
              {t('common.demoBadge')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] p-4">
            <p className="mb-3 text-[13px] text-muted">{t('common.demoHint')}</p>
            <DemoRoleSwitcher
              activeRole={role}
              onDone={(nextRole) => router.push(nextRole === 'master' ? routes.cabinet.root() : nextRole === 'admin' ? routes.admin.root() : routes.home())}
            />
          </PopoverContent>
        </Popover>

        <CitySelect compact className="max-sm:px-2.5" />
        <div className="hidden items-center sm:flex">
          <LocaleSwitch />
          <ThemeToggle />
        </div>
        {isAuthenticated ? <NotificationsBell /> : null}
        {isAuthenticated && user ? (
          <Link href={routes.profile()} className="lg:hidden" aria-label={t('nav.profile')}>
            <UserAvatar user={user} size="md" />
          </Link>
        ) : (
          <Link href={routes.login(pathname)} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'lg:hidden')}>
            <LogIn />
            <span className="max-sm:hidden">{t('nav.login')}</span>
          </Link>
        )}
      </div>
    </header>
  );
}
