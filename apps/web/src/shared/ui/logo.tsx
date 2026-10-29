import { cn } from '../lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('size-9', className)} aria-hidden>
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7b6bff" />
          <stop offset="55%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#c58cff" />
        </linearGradient>
        <linearGradient id="logo-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M20 2.5c-7.5 0-13.5 5.9-13.5 13.3 0 9.6 11.3 20 12.4 21a1.6 1.6 0 0 0 2.2 0c1.1-1 12.4-11.4 12.4-21C33.5 8.4 27.5 2.5 20 2.5Z" fill="url(#logo-grad)" />
      <path d="M20 2.5c-7.5 0-13.5 5.9-13.5 13.3 0 1.4.2 2.8.7 4.1C9 13 14 8 20 8s11 5 12.8 11.9c.5-1.3.7-2.7.7-4.1C33.5 8.4 27.5 2.5 20 2.5Z" fill="url(#logo-shine)" />
      <path d="M14.2 20.2V12.6l5.8 5.2 5.8-5.2v7.6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      {compact ? null : <span className="text-[19px] font-extrabold tracking-tight">Masterly</span>}
    </span>
  );
}
