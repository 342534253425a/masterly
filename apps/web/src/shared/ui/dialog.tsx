'use client';

import { X } from 'lucide-react';
import { Dialog as DialogPrimitive, VisuallyHidden } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const SIZES = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' } as const;

export interface DialogContentProps extends Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  hideTitle?: boolean;
  size?: keyof typeof SIZES;
  /** responsive — bottom sheet на телефоне и модальное окно на десктопе; right — боковая панель. */
  layout?: 'responsive' | 'right';
  footer?: ReactNode;
}

export function DialogContent({ title, description, hideTitle, size = 'md', layout = 'responsive', footer, className, children, ...props }: DialogContentProps) {
  const heading = (
    <div className="pr-10">
      <DialogPrimitive.Title className="text-lg font-bold tracking-tight">{title}</DialogPrimitive.Title>
      {description ? <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description> : null}
    </div>
  );
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(4_4_12/0.62)] backdrop-blur-[6px] data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col border border-line bg-elevated shadow-float outline-none',
          layout === 'responsive' &&
            'inset-x-0 bottom-0 max-h-[94dvh] rounded-t-[28px] pb-[env(safe-area-inset-bottom)] data-[state=closed]:animate-sheet-down data-[state=open]:animate-sheet-up sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[88dvh] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:pb-0 sm:data-[state=closed]:animate-content-out sm:data-[state=open]:animate-content-in',
          layout === 'responsive' && SIZES[size],
          layout === 'right' && 'inset-y-0 right-0 h-full w-full max-w-md rounded-l-[28px] data-[state=closed]:animate-sheet-right data-[state=open]:animate-sheet-left',
          className,
        )}
        {...props}
      >
        {layout === 'responsive' ? <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden /> : null}
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-2 pt-4 sm:px-6 sm:pt-6">
          {hideTitle ? <VisuallyHidden.Root>{heading}</VisuallyHidden.Root> : heading}
        </div>
        <DialogPrimitive.Close className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg sm:right-5 sm:top-5">
          <X className="size-[18px]" />
          <span className="sr-only">Закрыть</span>
        </DialogPrimitive.Close>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
        {footer ? <div className="shrink-0 border-t border-line px-5 py-4 sm:px-6">{footer}</div> : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
