import { cn } from '@/shared/lib';

export function riskTone(score: number): 'danger' | 'warning' | 'success' {
  if (score >= 0.6) return 'danger';
  if (score >= 0.3) return 'warning';
  return 'success';
}

/** Индикатор риска 0…1 — цвет и заполнение кольца. */
export function RiskMeter({ score, size = 44 }: { score: number; size?: number }) {
  const tone = riskTone(score);
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : 'var(--success)';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score)} />
      </svg>
      <span className={cn('absolute text-[11px] font-extrabold tabular-nums', tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-success')}>
        {Math.round(score * 100)}
      </span>
    </div>
  );
}
