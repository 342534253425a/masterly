import { cn } from '../lib/cn';

/**
 * «Шёлковая лента» из десятков кривых Безье — фирменный мотив AI-ассистента.
 * Анимируется весь <svg> (отдельный композитный слой GPU), а не внутренние узлы — без перерисовки каждый кадр.
 */
export function GradientRibbon({ className }: { className?: string }) {
  const lines = Array.from({ length: 22 }, (_, i) => i);
  return (
    <svg
      viewBox="0 0 800 280"
      preserveAspectRatio="none"
      className={cn('pointer-events-none animate-drift will-change-transform', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="ribbon-a" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6d5dfc" stopOpacity="0" />
          <stop offset="30%" stopColor="#8b5cf6" stopOpacity="0.9" />
          <stop offset="58%" stopColor="#f0e7ff" stopOpacity="1" />
          <stop offset="80%" stopColor="#a78bfa" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#6d28d9" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ribbon-b" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4f46e5" stopOpacity="0" />
          <stop offset="45%" stopColor="#c084fc" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
        </linearGradient>
        <filter id="ribbon-blur" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      <path d="M-40 250 C 180 270, 330 40, 560 70 S 760 170, 860 10" stroke="#8b5cf6" strokeWidth="46" fill="none" opacity="0.32" filter="url(#ribbon-blur)" />
      <g>
        {lines.map((i) => (
          <path
            key={i}
            d={`M -40 ${262 - i * 2.2} C ${170 + i * 3} ${282 - i * 5}, ${330 - i * 2} ${30 + i * 3.4}, ${560 + i} ${62 + i * 2.6} S ${770 - i * 2} ${178 - i * 3}, 860 ${8 + i * 2.2}`}
            stroke={i % 3 === 0 ? 'url(#ribbon-b)' : 'url(#ribbon-a)'}
            strokeWidth={i % 5 === 0 ? 1.6 : 0.9}
            strokeOpacity={0.12 + (i / lines.length) * 0.7}
            fill="none"
          />
        ))}
      </g>
    </svg>
  );
}

/** Сетка точек-«частиц» как в референсе — мягко затухает к краям. */
export function DotField({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none', className)}
      style={{
        backgroundImage: 'radial-gradient(rgb(196 181 253 / 0.55) 1px, transparent 1.2px)',
        backgroundSize: '14px 14px',
        maskImage: 'radial-gradient(closest-side, #000 25%, transparent)',
      }}
    />
  );
}

export function GlowOrb({ className, hue = 262 }: { className?: string; hue?: number }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none rounded-full blur-3xl', className)}
      style={{ background: `radial-gradient(circle, hsl(${hue} 90% 65% / 0.45), transparent 70%)` }}
    />
  );
}
