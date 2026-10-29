import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export const buttonVariants = cva(
  'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-semibold outline-none transition-[background-color,box-shadow,color,border-color,filter,transform] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-brand text-white shadow-[0_10px_28px_-10px_rgb(124_77_255/0.75)] hover:shadow-[0_14px_36px_-8px_rgb(139_92_246/0.85)] hover:brightness-[1.08]',
        secondary: 'border border-line bg-surface-2 text-fg hover:border-line-strong hover:bg-surface-3',
        outline: 'border border-line-strong bg-transparent text-fg hover:bg-surface-2',
        ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
        soft: 'bg-accent-soft text-accent hover:bg-accent/20 dark:text-accent-2',
        danger: 'bg-danger text-white hover:brightness-110',
        success: 'bg-success text-white hover:brightness-110 dark:text-black',
        link: 'h-auto rounded-none p-0 text-accent underline-offset-4 hover:underline dark:text-accent-2',
      },
      size: {
        xs: 'h-7 gap-1 rounded-lg px-2.5 text-xs [&_svg]:size-3.5',
        sm: 'h-8 gap-1.5 rounded-lg px-3 text-[13px] [&_svg]:size-3.5',
        md: 'h-10 rounded-xl px-4 text-sm [&_svg]:size-4',
        lg: 'h-12 rounded-2xl px-6 text-[15px] [&_svg]:size-[18px]',
        xl: 'h-14 rounded-2xl px-7 text-base [&_svg]:size-5',
        icon: 'size-10 rounded-xl [&_svg]:size-[18px]',
        'icon-sm': 'size-8 rounded-lg [&_svg]:size-4',
        'icon-lg': 'size-12 rounded-2xl [&_svg]:size-5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({ className, variant, size, asChild = false, loading = false, disabled, children, type, ...props }: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
