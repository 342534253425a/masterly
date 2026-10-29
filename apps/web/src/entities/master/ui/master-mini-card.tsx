import type { MasterCard } from '@masterly/contracts';
import { useTranslations } from 'next-intl';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { cn } from '@/shared/lib';
import { RatingValue } from '@/shared/ui';
import { MasterAvatar, OpenStatus, PriceTag } from './master-bits';

/** Компактная карточка для каруселей и подборок. */
export function MasterMiniCard({ master, className }: { master: MasterCard; className?: string }) {
  const t = useTranslations('common');
  return (
    <Link
      href={routes.master(master.slug)}
      className={cn(
        'group flex w-64 shrink-0 flex-col gap-3 rounded-3xl border border-line bg-surface p-4 shadow-card transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-line-strong',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <MasterAvatar master={master} size="md" />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{master.name}</div>
          <div className="truncate text-xs text-subtle">{master.districtName}</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <RatingValue rating={master.rating} count={t('reviews', { count: master.reviewsCount })} />
      </div>
      <OpenStatus state={master.openState} />
      {master.price ? <PriceTag range={master.price.range} size="sm" className="mt-auto" /> : null}
    </Link>
  );
}
