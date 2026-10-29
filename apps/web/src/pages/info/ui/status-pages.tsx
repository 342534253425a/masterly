import { Compass, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { buttonVariants, Container, DeviceIllustration } from '@/shared/ui';

export function NotFoundPage() {
  const t = useTranslations('errors');
  return (
    <Container className="flex min-h-[70dvh] flex-col items-center justify-center gap-5 py-16 text-center">
      <DeviceIllustration variant="diagnostics" hue={262} className="h-48 w-auto animate-float" />
      <div className="text-7xl font-extrabold tracking-tight text-gradient">404</div>
      <h1 className="text-2xl font-bold">{t('notFoundTitle')}</h1>
      <p className="max-w-md text-muted">{t('notFoundText')}</p>
      <div className="flex gap-3">
        <Link href={routes.home()} className={buttonVariants({ size: 'lg' })}>
          {t('toHome')}
        </Link>
        <Link href={routes.search()} className={buttonVariants({ size: 'lg', variant: 'secondary' })}>
          <Compass />
          Поиск
        </Link>
      </div>
    </Container>
  );
}

export function OfflinePage() {
  const t = useTranslations('errors');
  return (
    <Container className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-surface-2 text-accent">
        <WifiOff className="size-7" aria-hidden />
      </span>
      <h1 className="text-2xl font-bold">{t('offlineTitle')}</h1>
      <p className="max-w-md text-muted">{t('offlineText')}</p>
    </Container>
  );
}
