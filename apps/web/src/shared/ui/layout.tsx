import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Card } from './card';
import { Sparkline } from './charts';

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-8', className)}>{children}</div>;
}

export function SectionHeader({
  title,
  description,
  action,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2', className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-accent dark:text-accent-2">{eyebrow}</div> : null}
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8', className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-2">{eyebrow}</div> : null}
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[32px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[15px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function KpiCard({
  label,
  value,
  delta,
  series,
  icon,
  invert = false,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: number;
  series?: number[];
  icon?: ReactNode;
  /** Для метрик, где меньше = лучше (время ответа). */
  invert?: boolean;
  hint?: ReactNode;
}) {
  const positive = delta !== undefined && (invert ? delta < 0 : delta > 0);
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        {icon ? <span className="flex size-8 items-center justify-center rounded-xl bg-accent-soft text-accent [&_svg]:size-4 dark:text-accent-2">{icon}</span> : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-extrabold tabular-nums tracking-tight">{value}</div>
          {delta !== undefined ? (
            <div className={cn('mt-1 inline-flex items-center gap-0.5 text-xs font-semibold', positive ? 'text-success' : 'text-danger')}>
              {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {Math.abs(delta * 100).toFixed(1)}%
              {hint ? <span className="ml-1 font-medium text-subtle">{hint}</span> : null}
            </div>
          ) : hint ? (
            <div className="mt-1 text-xs text-subtle">{hint}</div>
          ) : null}
        </div>
        {series ? <Sparkline values={series} className="h-10 w-24" color={positive || delta === undefined ? '#8b5cf6' : '#fb7185'} /> : null}
      </div>
    </Card>
  );
}
