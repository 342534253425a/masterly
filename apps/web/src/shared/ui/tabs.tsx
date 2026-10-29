'use client';

import { LayoutGroup, motion } from 'motion/react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('scrollbar-none flex gap-1 overflow-x-auto border-b border-line', className)} {...props} />;
}

export function TabsTrigger({ className, children, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative inline-flex h-11 shrink-0 items-center gap-2 px-3.5 text-sm font-semibold text-muted outline-none transition-colors hover:text-fg data-[state=active]:text-fg',
        'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand after:opacity-0 after:transition-opacity data-[state=active]:after:opacity-100',
        className,
      )}
      {...props}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

/** Сегментный переключатель с «перетекающим» индикатором (motion layoutId). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
  ariaLabel,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  const id = useId();
  return (
    <LayoutGroup id={id}>
      <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex rounded-xl border border-line bg-surface-2/70 p-1', className)}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={cn(
                'relative inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-colors [&_svg]:size-4',
                size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
                active ? 'text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {active ? (
                <motion.span
                  layoutId="segment"
                  className="absolute inset-0 rounded-lg border border-line bg-surface shadow-[0_2px_10px_-4px_rgb(0_0_0/0.4)]"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              ) : null}
              <span className="relative inline-flex items-center gap-1.5">
                {option.icon}
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
