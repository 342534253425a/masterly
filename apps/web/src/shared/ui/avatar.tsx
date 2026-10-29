import { cn } from '../lib/cn';

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-[11px]',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
  xl: 'size-20 text-2xl',
  '2xl': 'size-28 text-4xl',
} as const;

export interface AvatarProps {
  initials: string;
  hue: number;
  size?: keyof typeof SIZES;
  shape?: 'circle' | 'squircle';
  online?: boolean;
  className?: string;
  label?: string;
}

/** Генеративный аватар: градиент по hue + инициалы. Не требует загрузки фото. */
export function Avatar({ initials, hue, size = 'md', shape = 'circle', online, className, label }: AvatarProps) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center font-bold text-white ring-1 ring-white/10',
        shape === 'circle' ? 'rounded-full' : size === 'xl' || size === '2xl' ? 'rounded-[28%]' : 'rounded-[30%]',
        SIZES[size],
        className,
      )}
      style={{
        backgroundImage: `radial-gradient(120% 120% at 20% 10%, hsl(${hue} 85% 68%) 0%, hsl(${(hue + 35) % 360} 78% 52%) 55%, hsl(${(hue + 70) % 360} 70% 38%) 100%)`,
      }}
    >
      <span className="drop-shadow-[0_1px_2px_rgb(0_0_0/0.35)]">{initials}</span>
      {online ? (
        <span className="absolute -bottom-px -right-px size-[30%] min-h-2 min-w-2 rounded-full border-2 border-surface bg-success" />
      ) : null}
    </span>
  );
}
