import type { LeadEvent, LeadStatus } from '@masterly/contracts';
import { Check, CircleDot, Eye, Flag, MessageSquareText, Play, Send, Star, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { cn, formatRelative, formatTime } from '@/shared/lib';
import { Badge, type BadgeProps } from '@/shared/ui';

const TONE: Record<LeadStatus, BadgeProps['tone']> = {
  new: 'info',
  viewed: 'info',
  responded: 'accent',
  accepted: 'accent',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
  declined: 'danger',
  expired: 'neutral',
};

export function LeadStatusBadge({ status, size = 'md' }: { status: LeadStatus; size?: BadgeProps['size'] }) {
  const t = useTranslations('lead.status');
  return (
    <Badge tone={TONE[status]} size={size}>
      {status === 'in_progress' ? <span className="size-1.5 animate-pulse rounded-full bg-current" /> : null}
      {t(status)}
    </Badge>
  );
}

const ICONS: Record<LeadEvent['type'], typeof Check> = {
  created: CircleDot,
  sent: Send,
  viewed: Eye,
  responded: MessageSquareText,
  accepted: Check,
  started: Play,
  completed: Flag,
  cancelled: X,
  reviewed: Star,
};

/** Таймлайн заявки — как трекинг заказа в референсе (Confirmed → On the way → …). */
export function LeadTimeline({ events }: { events: LeadEvent[] }) {
  const t = useTranslations('lead.timeline');
  const locale = useLocale();
  return (
    <ol className="relative flex flex-col gap-0">
      {events.map((event, i) => {
        const Icon = ICONS[event.type];
        const last = i === events.length - 1;
        return (
          <li key={`${event.type}-${event.at}-${i}`} className="relative flex gap-3.5 pb-5 last:pb-0">
            {!last ? <span className="absolute left-[15px] top-8 h-[calc(100%-26px)] w-px bg-gradient-to-b from-accent/60 to-line" aria-hidden /> : null}
            <span
              className={cn(
                'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border [&_svg]:size-3.5',
                last ? 'border-transparent bg-brand text-white shadow-glow' : 'border-accent/30 bg-accent-soft text-accent dark:text-accent-2',
              )}
            >
              <Icon aria-hidden />
            </span>
            <div className="min-w-0 pt-1">
              <div className="text-sm font-semibold">{t(event.type)}</div>
              {event.note ? <div className="mt-0.5 text-[13px] text-muted">{event.note}</div> : null}
              <div className="mt-0.5 text-xs text-subtle">
                {formatRelative(event.at, locale)} · {formatTime(event.at, locale)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Горизонтальный прогресс статуса (мобильный референс: Confirmed → On the way → In progress → Completed). */
export function LeadProgress({ status }: { status: LeadStatus }) {
  const t = useTranslations('lead.status');
  const steps: LeadStatus[] = ['new', 'responded', 'accepted', 'in_progress', 'completed'];
  const order: Record<LeadStatus, number> = { new: 0, viewed: 0, responded: 1, accepted: 2, in_progress: 3, completed: 4, cancelled: -1, declined: -1, expired: -1 };
  const current = order[status];
  return (
    <div className="flex items-center">
      {steps.map((step, i) => {
        const done = current >= i;
        return (
          <div key={step} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border text-[11px] font-bold transition-colors',
                  done ? 'border-transparent bg-brand text-white shadow-glow' : 'border-line-strong bg-surface-2 text-subtle',
                  current === i && 'ring-4 ring-accent/20',
                )}
              >
                {done && current !== i ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn('hidden whitespace-nowrap text-[11px] font-medium sm:block', done ? 'text-fg' : 'text-subtle')}>{t(step)}</span>
            </div>
            {i < steps.length - 1 ? <span className={cn('mx-1.5 h-0.5 flex-1 rounded-full sm:mb-5', current > i ? 'bg-brand' : 'bg-line-strong')} /> : null}
          </div>
        );
      })}
    </div>
  );
}
