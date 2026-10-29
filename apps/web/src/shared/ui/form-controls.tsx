'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Checkbox as CheckboxPrimitive, Select as SelectPrimitive, Slider as SliderPrimitive, Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-line bg-surface-3 p-0.5 transition-colors data-[state=checked]:border-transparent data-[state=checked]:bg-brand disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-[18px] rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.3)] transition-transform duration-200 data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  );
}

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-md border border-line-strong bg-surface-2 transition-colors data-[state=checked]:border-transparent data-[state=checked]:bg-brand',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3.5 text-white" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function Slider({ className, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  const thumbs = props.value?.length ?? props.defaultValue?.length ?? 1;
  return (
    <SliderPrimitive.Root className={cn('relative flex h-5 w-full touch-none select-none items-center', className)} {...props}>
      <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-surface-3">
        <SliderPrimitive.Range className="absolute h-full bg-brand" />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbs }, (_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className="block size-5 rounded-full border-2 border-white bg-accent shadow-[0_2px_10px_rgb(124_77_255/0.6)] transition-transform hover:scale-110 focus-visible:scale-110"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'inline-flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/70 px-3.5 text-sm text-fg outline-none transition hover:border-line-strong focus-visible:ring-4 focus-visible:ring-accent/15 data-[placeholder]:text-subtle [&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDown className="size-4 text-subtle" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({ className, children, position = 'popper', ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        sideOffset={6}
        className={cn(
          'z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-line bg-elevated p-1.5 shadow-float data-[state=open]:animate-pop',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item> & { children: ReactNode }) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-xl py-2 pl-2.5 pr-8 text-sm outline-none data-[highlighted]:bg-surface-2 data-[state=checked]:font-semibold',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2.5">
        <Check className="size-4 text-accent" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

/** Строка настройки: заголовок, описание и контрол справа. */
export function SettingRow({ title, description, control, htmlFor }: { title: ReactNode; description?: ReactNode; control: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <label htmlFor={htmlFor} className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        {description ? <span className="mt-0.5 block text-[13px] leading-snug text-muted">{description}</span> : null}
      </label>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
