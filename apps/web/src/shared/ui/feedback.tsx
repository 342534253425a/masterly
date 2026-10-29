import { LoaderCircle } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer rounded-xl bg-[length:200%_100%] bg-[linear-gradient(90deg,var(--surface-2)_0%,var(--surface-3)_50%,var(--surface-2)_100%)]',
        className,
      )}
      {...props}
    />
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-muted', className)}>
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      {label ? <span>{label}</span> : <span className="sr-only">Загрузка</span>}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-line px-6 py-14 text-center', className)}>
      {icon ? (
        <div className="relative mb-1 flex size-16 items-center justify-center rounded-2xl border border-line bg-surface-2 text-accent shadow-glow [&_svg]:size-7 dark:text-accent-2">
          {icon}
        </div>
      ) : null}
      <h3 className="text-lg font-bold">{title}</h3>
      {description ? <p className="max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Progress({ value, className, tone = 'accent' }: { value: number; className?: string; tone?: 'accent' | 'success' | 'warning' }) {
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-surface-3', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-700 ease-out', tone === 'accent' ? 'bg-brand' : tone === 'success' ? 'bg-success' : 'bg-warning')}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function ProgressRing({ value, size = 64, stroke = 6, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6a5cff" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#ring-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.max(0, Math.min(100, value)) / 100)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <span className="absolute text-sm font-bold">{children}</span>
    </div>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line bg-surface-2 px-1.5 font-sans text-[10px] font-semibold text-subtle', className)}>
      {children}
    </kbd>
  );
}

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return <div role="separator" className={cn('shrink-0 bg-line', vertical ? 'h-full w-px' : 'h-px w-full', className)} />;
}
