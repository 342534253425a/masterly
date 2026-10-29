import { ArrowRight, BadgeCheck, HandCoins, MessageSquareText, ScanSearch, ShieldCheck, Sparkles, Star, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { cn } from '@/shared/lib';
import { buttonVariants, Container, DeviceIllustration, GradientRibbon, SectionHeader } from '@/shared/ui';

export function HowItWorks() {
  const t = useTranslations('home.how');
  const steps = [
    { icon: Sparkles, title: t('step1Title'), text: t('step1Text') },
    { icon: ScanSearch, title: t('step2Title'), text: t('step2Text') },
    { icon: MessageSquareText, title: t('step3Title'), text: t('step3Text') },
  ];
  return (
    <section>
      <Container>
        <SectionHeader title={t('title')} />
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="relative overflow-hidden rounded-3xl border border-line bg-surface p-6">
              <span className="absolute -right-2 -top-6 text-[110px] font-extrabold leading-none text-fg/[0.04]">{i + 1}</span>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-brand text-white shadow-glow">
                <step.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-5 text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

export function TrustSection() {
  const t = useTranslations('home.trust');
  const items = [
    { icon: BadgeCheck, title: t('verifiedTitle'), text: t('verifiedText'), tone: 'text-info bg-info-soft' },
    { icon: Star, title: t('reviewsTitle'), text: t('reviewsText'), tone: 'text-warning bg-warning-soft' },
    { icon: ShieldCheck, title: t('warrantyTitle'), text: t('warrantyText'), tone: 'text-success bg-success-soft' },
    { icon: HandCoins, title: t('noFeeTitle'), text: t('noFeeText'), tone: 'text-accent bg-accent-soft dark:text-accent-2' },
  ];
  return (
    <section>
      <Container>
        <SectionHeader title={t('title')} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item.title} className="rounded-3xl border border-line bg-surface/70 p-5">
              <span className={cn('flex size-11 items-center justify-center rounded-2xl', item.tone)}>
                <item.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-bold">{item.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{item.text}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function MasterCta() {
  const t = useTranslations('home.masterCta');
  return (
    <section>
      <Container>
        <div className="relative isolate overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#2a1d6e_0%,#4b2aa8_45%,#7c3aed_100%)] p-8 text-white sm:p-12">
          <GradientRibbon className="absolute -right-20 bottom-0 -z-10 h-full w-[80%] opacity-60" />
          <DeviceIllustration variant="diagnostics" hue={280} className="absolute -right-6 top-1/2 -z-10 hidden h-64 w-auto -translate-y-1/2 opacity-90 md:block" />
          <div className="max-w-xl">
            <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <Wrench className="size-6" aria-hidden />
            </span>
            <h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">{t('title')}</h2>
            <p className="mt-3 text-[16px] text-white/80">{t('text')}</p>
            <Link href={routes.forMasters()} className={cn(buttonVariants({ size: 'lg' }), 'mt-7 bg-none bg-white text-[#4b2aa8] shadow-none hover:bg-white/90')}>
              {t('cta')}
              <ArrowRight />
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
