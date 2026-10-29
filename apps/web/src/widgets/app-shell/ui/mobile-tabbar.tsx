'use client';

import { ChartColumn, ClipboardList, House, Inbox, LayoutDashboard, Layers, Merge, MessageCircle, Plus, ShieldAlert, Star, UserRound, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLeadWizard } from '@/features/create-lead';
import { routes } from '@/shared/config';
import { Link, usePathname } from '@/shared/i18n';
import { cn } from '@/shared/lib';
import { areaOf } from '../model/navigation';
import { useNavBadges } from '../model/use-badges';

interface Tab {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
  exact?: boolean;
}

/** Нижняя навигация в духе мобильного референса: 4 вкладки + центральная кнопка «новая заявка». */
export function MobileTabBar() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const area = areaOf(pathname);
  const badges = useNavBadges();
  const openWizard = useLeadWizard((s) => s.openWizard);

  const tabs: Tab[] =
    area === 'cabinet'
      ? [
          { href: routes.cabinet.root(), icon: LayoutDashboard, label: t('cabinetNav.overview'), exact: true },
          { href: routes.cabinet.leads(), icon: Inbox, label: t('cabinetNav.leads'), badge: badges.leads },
          { href: routes.cabinet.reviews(), icon: Star, label: t('cabinetNav.reviews') },
          { href: routes.cabinet.analytics(), icon: ChartColumn, label: t('cabinetNav.analytics') },
        ]
      : area === 'admin'
        ? [
            { href: routes.admin.root(), icon: LayoutDashboard, label: t('adminNav.overview'), exact: true },
            { href: routes.admin.moderation(), icon: ShieldAlert, label: t('adminNav.moderation'), badge: badges.moderation },
            { href: routes.admin.duplicates(), icon: Merge, label: t('adminNav.duplicates') },
            { href: routes.admin.catalog(), icon: Layers, label: t('adminNav.catalog') },
          ]
        : [
            { href: routes.home(), icon: House, label: t('home'), exact: true },
            { href: routes.orders(), icon: ClipboardList, label: t('orders') },
            { href: routes.messages(), icon: MessageCircle, label: t('messages'), badge: badges.messages },
            { href: routes.profile(), icon: UserRound, label: t('profile') },
          ];

  const renderTab = (tab: Tab) => {
    const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
    const Icon = tab.icon;
    return (
      <Link key={tab.href} href={tab.href} aria-current={active ? 'page' : undefined} className={cn('relative flex flex-1 flex-col items-center gap-1 py-1.5 text-[10.5px] font-semibold transition-colors', active ? 'text-accent dark:text-accent-2' : 'text-subtle')}>
        <span className="relative">
          <Icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.9} aria-hidden />
          {tab.badge ? <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">{tab.badge}</span> : null}
        </span>
        <span className="max-w-full truncate px-0.5">{tab.label}</span>
      </Link>
    );
  };

  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label={t('menu')}>
      <div className="mx-auto flex h-[68px] max-w-lg items-center px-2">
        {tabs.slice(0, 2).map(renderTab)}
        {area === 'main' ? (
          <div className="flex flex-1 justify-center">
            <button
              type="button"
              onClick={() => openWizard()}
              aria-label={t('newRequest')}
              className="-mt-6 flex size-14 items-center justify-center rounded-full bg-brand text-white shadow-[0_10px_30px_-6px_rgb(124_77_255/0.8)] ring-4 ring-[var(--bg)] transition-transform active:scale-95"
            >
              <Plus className="size-7" strokeWidth={2.5} />
            </button>
          </div>
        ) : null}
        {tabs.slice(2).map(renderTab)}
      </div>
    </nav>
  );
}
