import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-semibold [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        neutral: 'border-line bg-surface-2 text-muted',
        accent: 'border-accent/25 bg-accent-soft text-accent dark:text-accent-2',
        success: 'border-success/25 bg-success-soft text-success',
        warning: 'border-warning/30 bg-warning-soft text-warning',
        danger: 'border-danger/25 bg-danger-soft text-danger',
        info: 'border-info/25 bg-info-soft text-info',
        solid: 'border-transparent bg-brand text-white',
        glass: 'border-white/15 bg-black/35 text-white backdrop-blur-md',
      },
      size: {
        sm: 'h-5 px-1.5 text-[10px] [&_svg]:size-3',
        md: 'h-6 px-2 text-[11px] [&_svg]:size-3.5',
        lg: 'h-7 px-2.5 text-xs [&_svg]:size-3.5',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}
