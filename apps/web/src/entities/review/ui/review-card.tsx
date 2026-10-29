import type { Review } from '@masterly/contracts';
import { BadgeCheck, Camera, CornerDownRight, ThumbsUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn, formatRelative } from '@/shared/lib';
import { Avatar, Stars } from '@/shared/ui';

const hueOf = (name: string) => [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;

export function ReviewCard({ review, footer, className }: { review: Review; footer?: ReactNode; className?: string }) {
  const t = useTranslations('reviews');
  const locale = useLocale();
  return (
    <article className={cn('rounded-3xl border border-line bg-surface p-5', className)}>
      <header className="flex items-start gap-3">
        <Avatar initials={review.author.initials} hue={hueOf(review.author.name)} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-bold">{review.author.name}</span>
            {review.verified ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                <BadgeCheck className="size-3.5" aria-hidden />
                {t('verified')}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-subtle">
            <Stars value={review.rating} size={12} />
            <span>{formatRelative(review.createdAt, locale)}</span>
            <span>·</span>
            <span className="truncate">
              {review.service.name}
              {review.model ? ` · ${review.model.name}` : ''}
            </span>
          </div>
        </div>
      </header>
      <p className="mt-3 text-[14px] leading-relaxed text-fg/90">{review.text}</p>
      {review.photos > 0 || review.helpful > 0 ? (
        <div className="mt-3 flex items-center gap-3 text-xs text-subtle">
          {review.photos > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Camera className="size-3.5" aria-hidden /> {review.photos}
            </span>
          ) : null}
          {review.helpful > 0 ? (
            <span className="inline-flex items-center gap-1">
              <ThumbsUp className="size-3.5" aria-hidden /> {t('helpful', { count: review.helpful })}
            </span>
          ) : null}
        </div>
      ) : null}
      {review.reply ? (
        <div className="mt-4 flex gap-2 rounded-2xl border border-line bg-surface-2/60 p-3.5">
          <CornerDownRight className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <div>
            <div className="text-xs font-bold">{t('reply')}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{review.reply.text}</p>
          </div>
        </div>
      ) : null}
      {footer ? <div className="mt-4">{footer}</div> : null}
    </article>
  );
}

export function RatingBreakdown({ rating, distribution, total }: { rating: number; distribution: number[]; total: number }) {
  const t = useTranslations('common');
  const max = Math.max(...distribution, 1);
  return (
    <div className="flex items-center gap-6">
      <div className="text-center">
        <div className="text-5xl font-extrabold tracking-tight">{rating.toFixed(1)}</div>
        <Stars value={rating} size={16} className="mt-1.5" />
        <div className="mt-1 text-xs text-subtle">{t('reviews', { count: total })}</div>
      </div>
      <ul className="flex flex-1 flex-col gap-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = distribution[star - 1] ?? 0;
          return (
            <li key={star} className="flex items-center gap-2 text-xs">
              <span className="w-3 font-semibold text-muted">{star}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div className={cn('h-full rounded-full', star >= 4 ? 'bg-amber-400' : star === 3 ? 'bg-amber-300/70' : 'bg-danger/70')} style={{ width: `${(count / max) * 100}%` }} />
              </div>
              <span className="w-8 text-right tabular-nums text-subtle">{count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
