import { Star } from 'lucide-react';
import { cn, formatPrice } from '@/shared/lib';

/** Маркер на карте: «пилюля» с ценой (без услуги — рейтинг). Светлая в обеих темах — читается на любой подложке; при отдалении — точка. */
export function PricePin({ price, rating, active, promoted, compact, locale = 'ru' }: { price: number | null; rating: number; active?: boolean; promoted?: boolean; compact?: boolean; locale?: string }) {
  if (compact) {
    return (
      <span
        className={cn(
          'block size-3.5 rounded-full border-2 border-white shadow-[0_0_0_4px_rgb(139_92_246/0.25)] transition-transform duration-200',
          active ? 'scale-150 bg-brand' : promoted ? 'bg-warning' : 'bg-accent',
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        'relative flex h-8 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-[12px] font-bold shadow-float transition-all duration-200',
        active
          ? 'z-10 scale-110 border-transparent bg-brand text-white shadow-glow'
          : promoted
            ? 'border-amber-400 bg-white text-zinc-900 hover:scale-105'
            : 'border-black/10 bg-white text-zinc-900 hover:scale-105',
      )}
    >
      {price !== null ? (
        <>{formatPrice(price, locale)}</>
      ) : (
        <>
          <Star className="size-3 fill-amber-400 text-amber-400" strokeWidth={0} />
          {rating.toFixed(1)}
        </>
      )}
      <span
        className={cn(
          'absolute -bottom-1 left-1/2 size-2.5 -translate-x-1/2 rotate-45 border-b border-r',
          active ? 'border-transparent bg-[#8b5cf6]' : promoted ? 'border-amber-400 bg-white' : 'border-black/10 bg-white',
        )}
      />
    </span>
  );
}
