import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  variant?: 'default' | 'glass' | 'gradient' | 'flat';
}

export function Card({ className, interactive, variant = 'default', ...props }: CardProps) {
  return (
    <div
      className={cn(
        'relative rounded-3xl',
        variant === 'default' && 'border border-line bg-surface shadow-card',
        variant === 'glass' && 'glass border border-line shadow-card',
        variant === 'gradient' && 'border-gradient shadow-card',
        variant === 'flat' && 'border border-line bg-surface-2/50',
        interactive && 'transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-4 p-5 pb-0 sm:p-6 sm:pb-0', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-bold tracking-tight text-fg', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-[13px] text-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 sm:p-6', className)} {...props} />;
}
