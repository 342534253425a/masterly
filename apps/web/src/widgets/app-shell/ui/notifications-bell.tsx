'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ClipboardList, MessageCircle, ShieldAlert, Sparkles, Star } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { notificationQueries } from '@/entities/notification';
import { useSession } from '@/entities/session';
import { apiCall } from '@/shared/api';
import { Link } from '@/shared/i18n';
import { cn, formatRelative } from '@/shared/lib';
import { Button, Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/shared/ui';

const ICONS = { lead: ClipboardList, message: MessageCircle, review: Star, system: Sparkles, moderation: ShieldAlert } as const;

export function NotificationsBell() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const { isAuthenticated } = useSession();
  const queryClient = useQueryClient();
  const { data } = useQuery({ ...notificationQueries.list(), enabled: isAuthenticated });
  const unread = data?.filter((n) => !n.read).length ?? 0;
  const readAll = useMutation({
    mutationFn: () => apiCall('readNotifications', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationQueries.list().queryKey }),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full border border-line bg-surface-2/50" aria-label={t('notifications')}>
          <Bell />
          {unread > 0 ? (
            <span className="absolute right-2 top-2 flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full border-2 border-[var(--surface-2)] bg-accent" />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,380px)]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-sm font-bold">{t('notifications')}</span>
          {unread > 0 ? (
            <Button variant="link" size="sm" onClick={() => readAll.mutate()}>
              {t('markAllRead')}
            </Button>
          ) : null}
        </div>
        <ul className="max-h-[60dvh] overflow-y-auto p-1.5">
          {!data?.length ? <li className="px-3 py-8 text-center text-sm text-muted">{t('noNotifications')}</li> : null}
          {data?.map((notification) => {
            const Icon = ICONS[notification.kind];
            const body = (
              <div className={cn('flex gap-3 rounded-2xl p-2.5 transition-colors hover:bg-surface-2', !notification.read && 'bg-accent-soft/60')}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-accent dark:text-accent-2">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold">{notification.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-muted">{notification.body}</span>
                  <span className="mt-1 block text-[11px] text-subtle">{formatRelative(notification.createdAt, locale)}</span>
                </span>
                {!notification.read ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" /> : null}
              </div>
            );
            return (
              <li key={notification.id}>
                {notification.href ? (
                  <PopoverClose asChild>
                    <Link href={notification.href}>{body}</Link>
                  </PopoverClose>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
