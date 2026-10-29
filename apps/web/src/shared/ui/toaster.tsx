'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

export { toast } from 'sonner';

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === 'light' ? 'light' : 'dark'}
      position="top-center"
      offset={16}
      gap={8}
      toastOptions={{
        classNames: {
          toast: '!rounded-2xl !border !border-line !bg-elevated !text-fg !shadow-float !font-sans',
          description: '!text-muted',
          actionButton: '!bg-brand !text-white !rounded-lg !font-semibold',
        },
      }}
    />
  );
}
