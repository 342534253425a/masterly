'use client';

import { ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DemoRoleSwitcher, PhoneLoginForm } from '@/features/auth';
import { routes } from '@/shared/config';
import { useRouter } from '@/shared/i18n';
import { Card, GlowOrb, LogoMark, Separator } from '@/shared/ui';

export function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const params = useSearchParams();
  const next = params?.get('next') ?? null;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
  const done = (role?: string) => router.replace(safeNext ?? (role === 'master' ? routes.cabinet.root() : role === 'admin' ? routes.admin.root() : routes.home()));

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-10">
      <GlowOrb className="absolute left-1/2 top-10 size-96 -translate-x-1/2" />
      <Card variant="glass" className="relative w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark className="size-12" />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
        </div>
        <PhoneLoginForm onSuccess={(user) => done(user.activeRole)} />
        <div className="my-6 flex items-center gap-3 text-xs text-subtle">
          <Separator className="flex-1" />
          {t('demoTitle')}
          <Separator className="flex-1" />
        </div>
        <DemoRoleSwitcher compact onDone={done} />
        <p className="mt-5 flex items-start gap-2 text-xs text-subtle">
          <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
          {t('demoText')}
        </p>
      </Card>
    </div>
  );
}
