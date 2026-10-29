import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  size?: 'sm' | 'md';
}

/** Переключаемый чип фильтра (aria-pressed для скринридеров). */
export function Chip({ active = false, size = 'md', className, type, ...props }: ChipProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition-all duration-200 [&_svg]:size-3.5',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-3.5 text-[13px]',
        active
          ? 'border-accent/50 bg-accent-soft text-fg shadow-[inset_0_0_0_1px_rgb(139_92_246/0.2)]'
          : 'border-line bg-surface-2/60 text-muted hover:border-line-strong hover:text-fg',
        className,
      )}
      {...props}
    />
  );
}
