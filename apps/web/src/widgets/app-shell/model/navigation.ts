import {
  CalendarDays,
  ChartColumn,
  ClipboardList,
  Heart,
  House,
  Inbox,
  LayoutDashboard,
  Layers,
  Map,
  Merge,
  MessageCircle,
  Receipt,
  ShieldAlert,
  Star,
  Store,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { routes } from '@/shared/config';

export type Area = 'main' | 'cabinet' | 'admin';

export interface NavItem {
  href: string;
  icon: LucideIcon;
  /** Ключ в messages: nav.<key>, nav.cabinetNav.<key>, nav.adminNav.<key>. */
  label: string;
  badge?: 'messages' | 'leads' | 'moderation';
  exact?: boolean;
}

export const MAIN_NAV: NavItem[] = [
  { href: routes.home(), icon: House, label: 'home', exact: true },
  { href: routes.search(), icon: Map, label: 'search' },
  { href: routes.orders(), icon: ClipboardList, label: 'orders' },
  { href: routes.messages(), icon: MessageCircle, label: 'messages', badge: 'messages' },
  { href: routes.favorites(), icon: Heart, label: 'favorites' },
  { href: routes.profile(), icon: UserRound, label: 'profile' },
];

export const CABINET_NAV: NavItem[] = [
  { href: routes.cabinet.root(), icon: LayoutDashboard, label: 'overview', exact: true },
  { href: routes.cabinet.leads(), icon: Inbox, label: 'leads', badge: 'leads' },
  { href: routes.cabinet.services(), icon: Wrench, label: 'services' },
  { href: routes.cabinet.schedule(), icon: CalendarDays, label: 'schedule' },
  { href: routes.cabinet.profile(), icon: Store, label: 'profile' },
  { href: routes.cabinet.reviews(), icon: Star, label: 'reviews' },
  { href: routes.cabinet.analytics(), icon: ChartColumn, label: 'analytics' },
  { href: routes.cabinet.team(), icon: Users, label: 'team' },
  { href: routes.cabinet.billing(), icon: Receipt, label: 'billing' },
];

export const ADMIN_NAV: NavItem[] = [
  { href: routes.admin.root(), icon: LayoutDashboard, label: 'overview', exact: true },
  { href: routes.admin.moderation(), icon: ShieldAlert, label: 'moderation', badge: 'moderation' },
  { href: routes.admin.duplicates(), icon: Merge, label: 'duplicates' },
  { href: routes.admin.catalog(), icon: Layers, label: 'catalog' },
  { href: routes.admin.users(), icon: Users, label: 'users' },
  { href: routes.admin.analytics(), icon: ChartColumn, label: 'analytics' },
];

export const areaOf = (pathname: string): Area =>
  pathname.startsWith('/cabinet') ? 'cabinet' : pathname.startsWith('/admin') ? 'admin' : 'main';

export const isActive = (pathname: string, item: NavItem) =>
  item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
