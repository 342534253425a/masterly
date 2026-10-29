import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type IllustrationVariant =
  | 'screen' | 'glass' | 'battery' | 'port' | 'camera' | 'water' | 'back'
  | 'speaker' | 'buttons' | 'faceid' | 'software' | 'diagnostics' | 'data' | 'network';

const BACK_VIEW = new Set<IllustrationVariant>(['camera', 'back']);

/**
 * Векторные иллюстрации неисправностей: единый визуальный язык вместо стоковых фото,
 * весят ~2 КБ, перекрашиваются под тему и hue мастера.
 */
export function DeviceIllustration({ variant, hue = 262, className, title }: { variant: IllustrationVariant; hue?: number; className?: string; title?: string }) {
  const id = `di-${variant}-${hue}`;
  const accent = `hsl(${hue} 92% 68%)`;
  const accent2 = `hsl(${(hue + 45) % 360} 90% 62%)`;
  const back = BACK_VIEW.has(variant);

  return (
    <svg viewBox="0 0 200 200" className={cn('overflow-visible', className)} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={`${id}-glow`} cx="50%" cy="48%" r="50%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
          <stop offset="55%" stopColor={accent2} stopOpacity="0.16" />
          <stop offset="100%" stopColor={accent2} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3a3a52" />
          <stop offset="45%" stopColor="#17172a" />
          <stop offset="100%" stopColor="#08080f" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="40%" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.35" />
        </linearGradient>
        <radialGradient id={`${id}-screen`} cx="28%" cy="18%" r="95%">
          <stop offset="0%" stopColor={`hsl(${hue} 95% 74%)`} />
          <stop offset="38%" stopColor={`hsl(${(hue + 30) % 360} 82% 52%)`} />
          <stop offset="72%" stopColor={`hsl(${(hue + 60) % 360} 70% 26%)`} />
          <stop offset="100%" stopColor="#0b0b1c" />
        </radialGradient>
        <linearGradient id={`${id}-backglass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue} 35% 30%)`} />
          <stop offset="55%" stopColor={`hsl(${hue} 30% 14%)`} />
          <stop offset="100%" stopColor="#0a0a14" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <circle cx="100" cy="98" r="86" fill={`url(#${id}-glow)`} />
      <ellipse cx="100" cy="184" rx="44" ry="5" fill="#000" opacity="0.35" />

      <g transform="rotate(-9 100 98)">
        <rect x="62" y="20" width="76" height="156" rx="17" fill={`url(#${id}-body)`} stroke={`url(#${id}-edge)`} strokeWidth="1.4" />
        {back ? (
          <>
            <rect x="65.5" y="23.5" width="69" height="149" rx="14" fill={`url(#${id}-backglass)`} />
            <rect x="70" y="28" width="34" height="34" rx="10" fill="#0d0d18" stroke="#ffffff" strokeOpacity="0.14" />
            {[[80, 38], [94, 38], [80, 52]].map(([cx, cy]) => (
              <g key={`${cx}-${cy}`}>
                <circle cx={cx} cy={cy} r="5.6" fill="#05050b" stroke="#ffffff" strokeOpacity="0.25" />
                <circle cx={cx} cy={cy} r="3" fill={accent} opacity="0.55" />
                <circle cx={(cx ?? 0) - 1.2} cy={(cy ?? 0) - 1.2} r="0.9" fill="#fff" opacity="0.9" />
              </g>
            ))}
            <circle cx="95" cy="53" r="2" fill="#fde68a" opacity="0.85" />
          </>
        ) : (
          <>
            <rect x="66" y="24" width="68" height="148" rx="13" fill={`url(#${id}-screen)`} />
            <rect x="86" y="29" width="28" height="7" rx="3.5" fill="#05050b" />
          </>
        )}
        <rect x="66" y="24" width="30" height="148" rx="13" fill={`url(#${id}-sheen)`} opacity="0.5" />
        {OVERLAYS[variant](id, accent, accent2)}
      </g>
    </svg>
  );
}

const crack = (d: string, width = 0.9, opacity = 0.85) => <path d={d} fill="none" stroke="#ffffff" strokeWidth={width} strokeOpacity={opacity} strokeLinecap="round" strokeLinejoin="round" />;

const OVERLAYS: Record<IllustrationVariant, (id: string, accent: string, accent2: string) => ReactNode> = {
  screen: () => (
    <g>
      <rect x="66" y="24" width="68" height="148" rx="13" fill="#05050c" opacity="0.42" />
      {crack('M108 74 L120 50 L126 30')}
      {crack('M108 74 L132 82')}
      {crack('M108 74 L96 102 L90 130 L84 168')}
      {crack('M108 74 L80 66 L68 70')}
      {crack('M108 74 L118 110 L130 128')}
      {crack('M96 102 L74 112', 0.6, 0.6)}
      {crack('M118 110 L104 140 L110 166', 0.6, 0.6)}
      {crack('M120 50 L134 58', 0.6, 0.6)}
      <circle cx="108" cy="74" r="3.2" fill="#ffffff" opacity="0.9" />
      <path d="M100 66 L108 74 L114 64 Z" fill="#ffffff" opacity="0.18" />
    </g>
  ),
  glass: (_, accent) => (
    <g>
      <rect x="74" y="48" width="52" height="8" rx="4" fill="#fff" opacity="0.32" />
      <rect x="74" y="62" width="34" height="6" rx="3" fill="#fff" opacity="0.2" />
      <rect x="74" y="122" width="52" height="34" rx="9" fill="#fff" opacity="0.12" />
      {crack('M134 34 L118 46 L112 64', 0.8, 0.75)}
      {crack('M118 46 L128 60', 0.6, 0.55)}
      <path d="M86 140 l3 -7 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 Z" fill={accent} opacity="0.9" />
    </g>
  ),
  battery: () => (
    <g>
      <rect x="66" y="24" width="68" height="148" rx="13" fill="#05050c" opacity="0.5" />
      <rect x="83" y="66" width="34" height="62" rx="8" fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="2.6" />
      <rect x="93" y="60" width="14" height="6" rx="2" fill="#fff" opacity="0.9" />
      <rect x="88" y="113" width="24" height="10" rx="3" fill="#fb7185" />
      <path d="M103 76 L92 98 L100 98 L96 116 L110 92 L102 92 Z" fill="#fde047" />
    </g>
  ),
  port: (_, accent) => (
    <g>
      <rect x="91" y="174" width="18" height="3.5" rx="1.75" fill={accent} />
      <rect x="93" y="186" width="14" height="12" rx="3" fill="#d4d4e4" />
      <rect x="97" y="182" width="6" height="5" rx="1" fill="#9a9ab4" />
      <path d="M100 198 C 100 212, 120 214, 132 222" stroke="#d4d4e4" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M84 168 l-6 -6 M116 168 l6 -6 M100 160 l0 -8" stroke="#fde047" strokeWidth="2" strokeLinecap="round" />
      <rect x="80" y="70" width="40" height="40" rx="12" fill="#05050c" opacity="0.35" />
      <path d="M103 76 L92 94 L100 94 L96 106 L109 88 L101 88 Z" fill="#fff" opacity="0.92" />
    </g>
  ),
  camera: (_, accent) => (
    <g>
      <circle cx="80" cy="38" r="9" fill="none" stroke={accent} strokeOpacity="0.55" strokeWidth="1.2" />
      <circle cx="80" cy="38" r="13" fill="none" stroke={accent} strokeOpacity="0.25" strokeWidth="1" />
      {crack('M73 33 L78 37 L76 42', 0.7, 0.9)}
      <path d="M100 120 l3 -8 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 Z" fill="#fff" opacity="0.5" />
    </g>
  ),
  water: () => (
    <g>
      <rect x="66" y="24" width="68" height="148" rx="13" fill="#38bdf8" opacity="0.22" />
      {[[58, 60, 1], [146, 92, 0.8], [52, 128, 0.7], [150, 40, 0.6], [140, 150, 0.9]].map(([x, y, s]) => (
        <path
          key={`${x}-${y}`}
          d={`M${x} ${y} c ${-6 * (s ?? 1)} ${9 * (s ?? 1)} ${-7 * (s ?? 1)} ${14 * (s ?? 1)} 0 ${16 * (s ?? 1)} c ${7 * (s ?? 1)} ${-2 * (s ?? 1)} ${6 * (s ?? 1)} ${-7 * (s ?? 1)} 0 ${-16 * (s ?? 1)} Z`}
          fill="#7dd3fc"
          opacity="0.9"
        />
      ))}
      <path d="M56 160 C 76 150, 92 170, 112 160 S 146 150, 150 160" stroke="#7dd3fc" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M62 172 C 82 162, 98 182, 118 172 S 150 164, 152 172" stroke="#38bdf8" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
    </g>
  ),
  back: () => (
    <g>
      {crack('M112 104 L126 84 L132 60')}
      {crack('M112 104 L80 96 L68 100')}
      {crack('M112 104 L104 132 L110 166')}
      {crack('M112 104 L132 124')}
      {crack('M104 132 L82 148', 0.6, 0.6)}
      <circle cx="112" cy="104" r="3" fill="#fff" opacity="0.85" />
    </g>
  ),
  speaker: (_, accent) => (
    <g>
      <rect x="88" y="30" width="24" height="4" rx="2" fill={accent} />
      {[14, 24, 34].map((r, i) => (
        <path key={r} d={`M${118 + i * 3} ${32 - r * 0.6} A ${r} ${r} 0 0 1 ${118 + i * 3} ${32 + r * 0.6}`} transform={`translate(${r * 0.4} 0)`} fill="none" stroke="#fff" strokeOpacity={0.9 - i * 0.25} strokeWidth="2.4" strokeLinecap="round" />
      ))}
      <rect x="80" y="80" width="40" height="40" rx="20" fill="#05050c" opacity="0.4" />
      <path d="M92 96 h6 l8 -7 v22 l-8 -7 h-6 Z" fill="#fff" opacity="0.92" />
    </g>
  ),
  buttons: (_, accent) => (
    <g>
      <rect x="137" y="58" width="5" height="22" rx="2" fill={accent} />
      <rect x="58" y="52" width="5" height="14" rx="2" fill="#a1a1bb" />
      <rect x="58" y="72" width="5" height="22" rx="2" fill={accent} opacity="0.85" />
      <circle cx="146" cy="69" r="9" fill="none" stroke={accent} strokeWidth="1.4" opacity="0.6" />
      <circle cx="146" cy="69" r="15" fill="none" stroke={accent} strokeWidth="1" opacity="0.3" />
      <rect x="80" y="80" width="40" height="40" rx="20" fill="#05050c" opacity="0.4" />
      <path d="M100 88 v10 M93 92 a 10 10 0 1 0 14 0" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </g>
  ),
  faceid: (_, accent) => (
    <g stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none">
      <path d="M80 70 v-8 a6 6 0 0 1 6 -6 h8 M106 56 h8 a6 6 0 0 1 6 6 v8 M120 112 v8 a6 6 0 0 1 -6 6 h-8 M94 126 h-8 a6 6 0 0 1 -6 -6 v-8" />
      <path d="M92 78 v6 M108 78 v6 M100 80 v12 h-3 M92 104 c 4 4 12 4 16 0" stroke={accent} />
    </g>
  ),
  software: (_, accent) => (
    <g>
      <rect x="66" y="24" width="68" height="148" rx="13" fill="#05050c" opacity="0.55" />
      <circle cx="100" cy="92" r="16" fill="none" stroke="#fff" strokeOpacity="0.15" strokeWidth="4" />
      <path d="M100 76 a16 16 0 0 1 16 16" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" />
      <rect x="80" y="124" width="40" height="5" rx="2.5" fill="#fff" opacity="0.2" />
      <rect x="80" y="124" width="24" height="5" rx="2.5" fill={accent} />
      <path d="M86 146 l-6 5 l6 5 M114 146 l6 5 l-6 5 M104 143 l-8 16" stroke="#fff" strokeOpacity="0.7" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  ),
  diagnostics: (_, accent) => (
    <g>
      <rect x="66" y="24" width="68" height="148" rx="13" fill="#05050c" opacity="0.5" />
      <path d="M70 98 h14 l5 -12 l7 26 l6 -32 l6 22 l4 -4 h16" stroke={accent} strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M70 98 h14 l5 -12 l7 26 l6 -32 l6 22 l4 -4 h16" stroke="#fff" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      {[128, 140, 152].map((y, i) => (
        <g key={y}>
          <circle cx="80" cy={y} r="3.5" fill={i < 2 ? '#34d399' : '#fbbf24'} />
          <rect x="88" y={y - 2} width={30 - i * 6} height="4" rx="2" fill="#fff" opacity="0.25" />
        </g>
      ))}
    </g>
  ),
  data: (_, accent) => (
    <g>
      <rect x="66" y="24" width="68" height="148" rx="13" fill="#05050c" opacity="0.45" />
      <path d="M80 82 h14 l5 6 h21 a3 3 0 0 1 3 3 v26 a3 3 0 0 1 -3 3 h-40 a3 3 0 0 1 -3 -3 v-32 a3 3 0 0 1 3 -3 Z" fill={accent} opacity="0.9" />
      <path d="M100 112 v-14 M94 104 l6 -6 l6 6" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {[136, 146].map((y) => (
        <rect key={y} x="80" y={y} width="40" height="5" rx="2.5" fill="#fff" opacity="0.2" />
      ))}
    </g>
  ),
  network: (_, accent) => (
    <g>
      <rect x="66" y="24" width="68" height="148" rx="13" fill="#05050c" opacity="0.45" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={82 + i * 10} y={118 - i * 10} width="6" height={12 + i * 10} rx="2" fill={i < 2 ? '#fff' : accent} opacity={i < 2 ? 0.9 : 0.35} />
      ))}
      <path d="M84 78 a24 24 0 0 1 32 0 M89 84 a16 16 0 0 1 22 0 M94 90 a8 8 0 0 1 12 0" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity="0.9" />
      <path d="M118 66 l12 12 M130 66 l-12 12" stroke="#fb7185" strokeWidth="2.6" strokeLinecap="round" />
    </g>
  ),
};
