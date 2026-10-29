'use client';

import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button, Container } from '@/shared/ui';

/** Граница ошибок сегмента: в бою — отправка в Sentry/OTel, пользователю — понятный экран и повтор. */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors');
  const tCommon = useTranslations('common');
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Container className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-bold">{t('genericTitle')}</h1>
      <p className="max-w-md text-muted">{t('genericText')}</p>
      {error.digest ? <code className="text-xs text-subtle">{error.digest}</code> : null}
      <Button onClick={reset}>
        <RotateCcw />
        {tCommon('retry')}
      </Button>
    </Container>
  );
}
