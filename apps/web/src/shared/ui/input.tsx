import type { ComponentProps, LabelHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

const fieldBase =
  'w-full rounded-xl border border-line bg-surface-2/70 text-sm text-fg placeholder:text-subtle outline-none transition-[border-color,background-color,box-shadow] hover:border-line-strong focus:border-accent/60 focus:bg-surface focus:ring-4 focus:ring-accent/15 aria-[invalid=true]:border-danger/60 aria-[invalid=true]:ring-danger/15 disabled:cursor-not-allowed disabled:opacity-60';

export interface InputProps extends ComponentProps<'input'> {
  leading?: ReactNode;
  trailing?: ReactNode;
  invalid?: boolean;
  inputSize?: 'md' | 'lg';
}

export function Input({ className, leading, trailing, invalid, inputSize = 'md', ...props }: InputProps) {
  const input = (
    <input
      aria-invalid={invalid || undefined}
      className={cn(fieldBase, inputSize === 'lg' ? 'h-13 px-4 text-base' : 'h-11 px-3.5', leading && 'pl-10', trailing && 'pr-11', className)}
      {...props}
    />
  );
  if (!leading && !trailing) return input;
  return (
    <div className="relative">
      {leading ? (
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle [&_svg]:size-4">{leading}</span>
      ) : null}
      {input}
      {trailing ? <span className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</span> : null}
    </div>
  );
}

export function Textarea({ className, invalid, ...props }: ComponentProps<'textarea'> & { invalid?: boolean }) {
  return <textarea aria-invalid={invalid || undefined} className={cn(fieldBase, 'min-h-28 resize-y px-3.5 py-3 leading-relaxed', className)} {...props} />;
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-[13px] font-semibold text-fg', className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
  aside,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label || aside ? (
        <div className="flex items-center justify-between gap-3">
          {label ? <Label htmlFor={htmlFor}>{label}</Label> : <span />}
          {aside}
        </div>
      ) : null}
      {children}
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
