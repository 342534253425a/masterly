'use client';

import { ArrowLeft, ArrowRight, ChevronsUpDown, Crown, LayoutDashboard, LogIn, LogOut, PanelLeftClose, PanelLeftOpen, ShieldCheck, Wrench } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { DemoRoleSwitcher, useLogout } from '@/features/auth';
import { UserAvatar, useSession } from '@/entities/session';
import { routes } from '@/shared/config';
import { Link, usePathname, useRouter } from '@/shared/i18n';
import { cn } from '@/shared/lib';
import { useHydrated } from '@/shared/lib/hooks';
import { Badge, Button, buttonVariants, Logo, LogoMark, Popover, PopoverContent, PopoverTrigger, toast, Tooltip } from '@/shared/ui';
import { ADMIN_NAV, areaOf, CABINET_NAV, isActive, MAIN_NAV, type NavItem } from '../model/navigation';
import { useShellPrefs } from '../model/shell-store';
import { useNavBadges } from '../model/use-badges';

function NavLink({ item, collapsed, label, badge }: { item: NavItem; collapsed: boolean; label: string; badge: number }) {
  const pathname = usePathname();
  const active = isActive(pathname, item);
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-11 items-center gap-3 rounded-2xl px-3 text-[14px] font-semibold transition-colors duration-200',
        active ? 'text-fg' : 'text-muted hover:bg-surface-2/70 hover:text-fg',
        collapsed && 'justify-center px-0',
      )}
    >
      {active ? (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-2xl border-gradient shadow-glow"
          style={{ background: 'linear-gradient(135deg, rgb(139 92 246 / 0.22), rgb(139 92 246 / 0.06)) padding-box, linear-gradient(135deg, rgb(167 139 250 / 0.75), rgb(255 255 255 / 0.06) 45%, rgb(139 92 246 / 0.45)) border-box' }}
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
        />
      ) : null}
      <Icon className={cn('relative size-[19px] shrink-0 transition-colors', active ? 'text-accent dark:text-accent-2' : 'text-subtle group-hover:text-fg')} aria-hidden />
      {collapsed ? null : <span className="relative truncate">{label}</span>}
      {badge > 0 ? (
        <span
          className={cn(
            'relative flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-bold text-white',
            collapsed ? 'absolute right-1.5 top-1 h-4 min-w-4 px-1' : 'ml-auto',
          )}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </Link>
  );
  return collapsed ? (
    <Tooltip content={label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

export function Sidebar() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();
  const area = areaOf(pathname);
  const hydrated = useHydrated();
  const { collapsed: storedCollapsed, toggle } = useShellPrefs();
  const collapsed = hydrated && storedCollapsed;
  const { user, role, isAuthenticated } = useSession();
  const badges = useNavBadges();
  const logout = useLogout();

  const items = area === 'cabinet' ? CABINET_NAV : area === 'admin' ? ADMIN_NAV : MAIN_NAV;
  const labelOf = (item: NavItem) => (area === 'cabinet' ? t(`cabinetNav.${item.label}` as 'cabinetNav.overview') : area === 'admin' ? t(`adminNav.${item.label}` as 'adminNav.overview') : t(item.label as 'home'));

  return (
    <aside
      className="glass fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] flex-col border-r border-line px-3 pb-4 pt-5 transition-[width] duration-300 lg:flex"
      aria-label={t('menu')}
    >
      <div className={cn('mb-6 flex items-center justify-between px-2', collapsed && 'flex-col gap-3 px-0')}>
        <Link href={routes.home()} aria-label="Masterly">
          {collapsed ? <LogoMark /> : <Logo />}
        </Link>
        <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={collapsed ? t('expand') : t('collapse')}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>

      {area !== 'main' ? (
        <Link href={routes.home()} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mb-3 justify-start text-subtle', collapsed && 'justify-center px-0')}>
          <ArrowLeft />
          {collapsed ? null : t('backToSite')}
        </Link>
      ) : null}
      {area !== 'main' && !collapsed ? (
        <div className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-subtle">{area === 'cabinet' ? t('cabinet') : t('admin')}</div>
      ) : null}

      <nav className="flex flex-col gap-1">
        {items.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} label={labelOf(item)} badge={item.badge ? badges[item.badge] : 0} />
        ))}
      </nav>

      {area === 'main' && (role === 'master' || role === 'admin') ? (
        <Link
          href={role === 'master' ? routes.cabinet.root() : routes.admin.root()}
          className={cn('mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-accent/40 px-3 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent-soft dark:text-accent-2', collapsed && 'justify-center px-0')}
        >
          {role === 'master' ? <LayoutDashboard className="size-[18px]" /> : <ShieldCheck className="size-[18px]" />}
          {collapsed ? null : role === 'master' ? t('cabinet') : t('admin')}
          {collapsed ? null : <ArrowRight className="ml-auto size-4" />}
        </Link>
      ) : null}

      <div className="flex-1" />

      {!collapsed && area !== 'admin' ? (
        <div className="relative mb-3 overflow-hidden rounded-3xl border-gradient p-4">
          <div aria-hidden className="absolute -right-10 -top-10 size-32 rounded-full bg-accent/30 blur-2xl" />
          <span className="relative mb-3 flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent dark:text-accent-2">
            {role === 'master' ? <Crown className="size-[18px]" /> : <Wrench className="size-[18px]" />}
          </span>
          <div className="relative text-[15px] font-bold">{role === 'master' ? t('promo.masterTitle') : t('promo.clientTitle')}</div>
          <p className="relative mt-1 text-[12.5px] leading-snug text-muted">{role === 'master' ? t('promo.masterText') : t('promo.clientText')}</p>
          <Link href={role === 'master' ? routes.cabinet.billing() : routes.forMasters()} className={cn(buttonVariants({ size: 'sm' }), 'relative mt-3 w-full')}>
            {role === 'master' ? t('promo.masterCta') : t('promo.clientCta')}
            <ArrowRight />
          </Link>
        </div>
      ) : null}

      {isAuthenticated && user ? (
        <Popover>
          <PopoverTrigger className={cn('flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2/50 p-2.5 text-left transition hover:border-line-strong', collapsed && 'justify-center p-1.5')}>
            <UserAvatar user={user} size="md" />
            {collapsed ? null : (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{user.name}</span>
                  <span className="block truncate text-xs text-muted">{t(`roles.${user.activeRole}`)}</span>
                </span>
                <ChevronsUpDown className="size-4 text-subtle" />
              </>
            )}
          </PopoverTrigger>
          <PopoverContent side="right" align="end" className="w-80 p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-subtle">{t('switchRole')}</span>
              <Badge tone="accent" size="sm">
                demo
              </Badge>
            </div>
            <DemoRoleSwitcher
              compact
              activeRole={role}
              onDone={(nextRole) => router.push(nextRole === 'master' ? routes.cabinet.root() : nextRole === 'admin' ? routes.admin.root() : routes.home())}
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Link href={routes.profile()} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                {t('settings')}
              </Link>
              <Button
                variant="ghost"
                size="sm"
                loading={logout.isPending}
                onClick={() =>
                  logout.mutate(undefined, {
                    onSuccess: () => {
                      toast(t('logout'));
                      router.push(routes.home());
                    },
                  })
                }
              >
                <LogOut />
                {t('logout')}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <Link href={routes.login(pathname)} className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full', collapsed && 'px-0')}>
          <LogIn />
          {collapsed ? null : t('login')}
        </Link>
      )}
    </aside>
  );
}
