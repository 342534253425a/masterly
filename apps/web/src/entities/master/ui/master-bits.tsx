import type { MasterCard, OpenState, PriceRange, Verification } from '@masterly/contracts';
import { BadgeCheck, Megaphone } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { cn, formatDate, formatPrice } from '@/shared/lib';
import { Avatar, Badge, Tooltip, type AvatarProps } from '@/shared/ui';

export function MasterAvatar({ master, size = 'lg', className }: { master: Pick<MasterCard, 'initials' | 'hue' | 'name'> & { kind?: MasterCard['kind'] }; size?: AvatarProps['size']; className?: string }) {
  return <Avatar initials={master.initials} hue={master.hue} size={size} shape={master.kind === 'workshop' ? 'squircle' : 'circle'} className={className} label={master.name} />;
}

export function VerifiedBadge({ verification, compact }: { verification: Verification; compact?: boolean }) {
  const t = useTranslations('master');
  const locale = useLocale();
  const items = [
    verification.identity && t('verification.identity'),
    verification.business && t('verification.business'),
    verification.address && t('verification.address'),
  ].filter(Boolean);
  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-0.5">
          {items.map((item) => (
            <span key={String(item)}>✓ {item}</span>
          ))}
          <span className="mt-1 text-subtle">{t('verification.reviewedAt', { date: formatDate(verification.reviewedAt, locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}</span>
        </span>
      }
    >
      <span className="relative z-10 inline-flex cursor-help items-center gap-1 text-[12px] font-semibold text-info">
        <BadgeCheck className="size-4 fill-info/15" aria-hidden />
        {compact ? <span className="sr-only">{t('verified')}</span> : t('verified')}
      </span>
    </Tooltip>
  );
}

export function OpenStatus({ state, className }: { state: OpenState; className?: string }) {
  const t = useTranslations('master');
  let label: string;
  if (state.open) label = state.closesAt === '23:59' ? t('allDay') : t('openNow', { time: state.closesAt ?? '' });
  else if (state.opensAt === null || state.inDays === null) label = t('closed');
  else if (state.inDays === 0) label = t('closedOpensToday', { time: state.opensAt });
  else if (state.inDays === 1) label = t('closedOpensTomorrow', { time: state.opensAt });
  else label = t('closedOpensIn', { days: state.inDays });
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium', state.open ? 'text-success' : 'text-subtle', className)}>
      <span className={cn('size-1.5 rounded-full', state.open ? 'bg-success shadow-[0_0_8px] shadow-success' : 'bg-subtle')} />
      {label}
    </span>
  );
}

export function PriceTag({ range, size = 'md', className }: { range: PriceRange; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const t = useTranslations('common');
  const locale = useLocale();
  const text =
    range.from === 0
      ? t('free')
      : range.to && range.to > range.from
        ? t('priceRange', { from: formatPrice(range.from, locale).replace(/\s?₽/, ''), to: formatPrice(range.to, locale) })
        : t('priceFrom', { price: formatPrice(range.from, locale) });
  return (
    <span className={cn('font-extrabold tabular-nums tracking-tight', size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-2xl' : 'text-base', className)}>{text}</span>
  );
}

/** Маркировка рекламы по 38-ФЗ: «Реклама» + рекламодатель и erid. */
export function PromotedLabel({ promoted }: { promoted: NonNullable<MasterCard['promoted']> }) {
  const t = useTranslations('search');
  return (
    <Tooltip content={t('adInfo', { advertiser: promoted.advertiser, erid: promoted.erid })}>
      <span className="relative z-10">
        <Badge tone="warning" size="sm" className="cursor-help uppercase tracking-wide">
          <Megaphone aria-hidden />
          {t('ad')}
        </Badge>
      </span>
    </Tooltip>
  );
}

export const warrantyMonths = (days: number) => Math.max(1, Math.round(days / 30));
