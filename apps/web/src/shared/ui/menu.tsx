'use client';

import { Check } from 'lucide-react';
import { DropdownMenu as Menu, Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

const panel = 'z-50 min-w-48 overflow-hidden rounded-2xl border border-line bg-elevated p-1.5 shadow-float outline-none data-[state=open]:animate-pop';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export function DropdownMenuContent({ className, sideOffset = 8, align = 'end', ...props }: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content sideOffset={sideOffset} align={align} className={cn(panel, className)} {...props} />
    </Menu.Portal>
  );
}

const itemBase =
  'relative flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-fg outline-none transition-colors data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted';

export function DropdownMenuItem({ className, destructive, ...props }: ComponentProps<typeof Menu.Item> & { destructive?: boolean }) {
  return <Menu.Item className={cn(itemBase, destructive && 'text-danger [&_svg]:text-danger', className)} {...props} />;
}

export function DropdownMenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem className={cn(itemBase, 'pr-8', className)} {...props}>
      {children}
      <Menu.ItemIndicator className="absolute right-2.5">
        <Check className="!text-accent" />
      </Menu.ItemIndicator>
    </Menu.CheckboxItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn('px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-subtle', className)} {...props} />;
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <Menu.Separator className={cn('-mx-1.5 my-1.5 h-px bg-line', className)} />;
}

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({ className, sideOffset = 8, align = 'end', ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content sideOffset={sideOffset} align={align} className={cn(panel, 'p-0', className)} {...props} />
    </PopoverPrimitive.Portal>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-64 rounded-xl border border-line bg-elevated px-2.5 py-1.5 text-xs font-medium text-fg shadow-float data-[state=delayed-open]:animate-pop"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
