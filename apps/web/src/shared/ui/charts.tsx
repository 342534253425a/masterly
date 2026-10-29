'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';

const PALETTE = ['#8b5cf6', '#38bdf8', '#34d399', '#f472b6', '#fbbf24', '#a3a3bd'];

function linePath(values: number[], width: number, height: number, padding = 2) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => [i * step, height - padding - ((v - min) / span) * (height - padding * 2)] as const);
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  return { d, points };
}

export function Sparkline({ values, className, color = '#8b5cf6' }: { values: number[]; className?: string; color?: string }) {
  const id = useId();
  if (values.length < 2) return null;
  const { d } = linePath(values, 100, 32);
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={cn('h-8 w-full overflow-visible', className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L100 32 L0 32 Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export interface ChartSeries {
  key: string;
  label: string;
  values: number[];
  color?: string;
}

/** Площадная диаграмма с интерактивной подсказкой (без тяжёлых чарт-библиотек). */
export function AreaChart({
  series,
  labels,
  height = 220,
  format = (v: number) => String(v),
  className,
}: {
  series: ChartSeries[];
  labels: string[];
  height?: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const width = 600;
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const count = labels.length;
  const x = (i: number) => (count > 1 ? (i / (count - 1)) * width : 0);
  const y = (v: number) => height - 18 - (v / max) * (height - 34);
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full overflow-visible"
        style={{ height }}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setHover(Math.round(((event.clientX - rect.left) / rect.width) * (count - 1)));
        }}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={series.map((s) => s.label).join(', ')}
      >
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? PALETTE[i]} stopOpacity="0.32" />
              <stop offset="100%" stopColor={s.color ?? PALETTE[i]} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((tick) => (
          <line key={tick} x1="0" x2={width} y1={y(tick)} y2={y(tick)} stroke="var(--line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        ))}
        {series.map((s, i) => {
          const d = s.values.map((v, j) => `${j === 0 ? 'M' : 'L'}${x(j).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
          return (
            <g key={s.key}>
              <path d={`${d} L${width} ${height - 18} L0 ${height - 18} Z`} fill={`url(#${id}-${s.key})`} />
              <path d={d} fill="none" stroke={s.color ?? PALETTE[i]} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </g>
          );
        })}
        {hover !== null ? <line x1={x(hover)} x2={x(hover)} y1="0" y2={height - 18} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
      {hover !== null && labels[hover] ? (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-36 -translate-x-1/2 rounded-xl border border-line bg-elevated/95 px-3 py-2 text-xs shadow-float backdrop-blur"
          style={{ left: `${Math.min(88, Math.max(12, (hover / Math.max(1, count - 1)) * 100))}%` }}
        >
          <div className="mb-1 font-semibold text-muted">{labels[hover]}</div>
          {series.map((s, i) => (
            <div key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted">
                <span className="size-2 rounded-full" style={{ background: s.color ?? PALETTE[i] }} />
                {s.label}
              </span>
              <span className="font-bold text-fg">{format(s.values[hover] ?? 0)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-1 flex justify-between text-[10px] text-subtle">
        <span>{labels[0]}</span>
        <span>{labels[Math.floor(count / 2)]}</span>
        <span>{labels[count - 1]}</span>
      </div>
    </div>
  );
}

export function BarList({ items, format = (v: number) => String(v), className }: { items: Array<{ label: ReactNode; value: number; hint?: ReactNode }>; format?: (v: number) => string; className?: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className={cn('flex flex-col gap-2.5', className)}>
      {items.map((item, i) => (
        <li key={i} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate font-medium text-fg">{item.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-muted">
              {format(item.value)}
              {item.hint ? <span className="ml-1.5 text-subtle">{item.hint}</span> : null}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Воронка «показы → просмотры → контакты → заявки» с конверсией между шагами. */
export function Funnel({ stages, format = (v: number) => String(v) }: { stages: Array<{ label: ReactNode; value: number }>; format?: (v: number) => string }) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <ol className="flex flex-col gap-1.5">
      {stages.map((stage, i) => {
        const previous = stages[i - 1];
        const conversion = previous && previous.value ? stage.value / previous.value : null;
        return (
          <li key={i} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <div className="relative h-11 overflow-hidden rounded-xl bg-surface-2">
              <div
                className="absolute inset-y-0 left-0 rounded-xl transition-[width] duration-700"
                style={{ width: `${Math.max(6, Math.sqrt(stage.value / max) * 100)}%`, background: `linear-gradient(90deg, hsl(${262 - i * 18} 85% 62% / 0.9), hsl(${262 - i * 18} 85% 62% / 0.35))` }}
              />
              <div className="relative flex h-full items-center justify-between px-3.5 text-[13px]">
                <span className="font-semibold text-fg">{stage.label}</span>
                <span className="font-bold tabular-nums">{format(stage.value)}</span>
              </div>
            </div>
            <span className="w-14 text-right text-xs font-semibold tabular-nums text-subtle">{conversion !== null ? `${(conversion * 100).toFixed(conversion < 0.1 ? 1 : 0)}%` : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Columns({ values, labels, className, highlight }: { values: number[]; labels?: string[]; className?: string; highlight?: number }) {
  const max = Math.max(...values, 1);
  const peak = highlight ?? values.indexOf(max);
  return (
    <div className={cn('flex h-32 items-end gap-1', className)}>
      {values.map((value, i) => (
        <div key={i} className="group flex flex-1 flex-col items-center gap-1">
          <div
            title={labels?.[i] ? `${labels[i]}: ${value}` : String(value)}
            className={cn('w-full rounded-md transition-all duration-500', i === peak ? 'bg-brand' : 'bg-accent/25 group-hover:bg-accent/50')}
            style={{ height: `${Math.max(4, (value / max) * 100)}%` }}
          />
          {labels && i % 3 === 0 ? <span className="text-[9px] text-subtle">{labels[i]}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function Donut({ segments, size = 132, children }: { segments: Array<{ label: string; value: number; color?: string }>; size?: number; children?: ReactNode }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  // Смещение дуги — сумма длин предыдущих сегментов (накопление без переприсваивания во время рендера)
  const arcs = useMemo(
    () =>
      segments.map((segment, i) => ({
        ...segment,
        color: segment.color ?? PALETTE[i % PALETTE.length]!,
        length: (segment.value / total) * circumference,
        offset: segments.slice(0, i).reduce((sum, previous) => sum + (previous.value / total) * circumference, 0),
      })),
    [segments, total, circumference],
  );
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth="14" />
          {arcs.map((arc) => (
            <circle key={arc.label} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={arc.color} strokeWidth="14" strokeDasharray={`${Math.max(0, arc.length - 3)} ${circumference}`} strokeDashoffset={-arc.offset} strokeLinecap="round" />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
      </div>
      <ul className="flex flex-col gap-1.5 text-[13px]">
        {arcs.map((arc) => (
          <li key={arc.label} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: arc.color }} />
            <span className="text-muted">{arc.label}</span>
            <span className="font-semibold tabular-nums">{Math.round((arc.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
