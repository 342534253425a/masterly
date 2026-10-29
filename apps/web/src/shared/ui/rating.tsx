import { Star } from 'lucide-react';
import { cn } from '../lib/cn';

export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  const percent = Math.max(0, Math.min(100, (value / 5) * 100));
  const row = (filled: boolean) => (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} width={size} height={size} className={filled ? 'fill-amber-400 text-amber-400' : 'fill-surface-3 text-surface-3'} strokeWidth={0} />
      ))}
    </span>
  );
  return (
    <span className={cn('relative inline-flex', className)} role="img" aria-label={`${value.toFixed(1)} из 5`}>
      {row(false)}
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${percent}%` }}>
        {row(true)}
      </span>
    </span>
  );
}

export function RatingValue({ rating, count, className }: { rating: number; count?: string | number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-[13px] font-semibold text-fg', className)}>
      <Star className="size-3.5 fill-amber-400 text-amber-400" strokeWidth={0} aria-hidden />
      {rating.toFixed(1)}
      {count !== undefined ? <span className="font-medium text-subtle">({count})</span> : null}
    </span>
  );
}
