import { ArrowRight, CalendarClock, Check, ChartColumn, Crown, Inbox, Megaphone, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { cn } from '@/shared/lib';
import { Badge, buttonVariants, Card, Container, DeviceIllustration, GradientRibbon, SectionHeader } from '@/shared/ui';

export async function generateForMastersMetadata() {
  const t = await getTranslations('forMasters');
  return { title: `${t('title')} ${t('titleAccent')}`, description: t('subtitle') };
}

/** Монетизация без комиссии: бесплатное размещение, Pro, продвижение (маркировка рекламы), оплата по счёту. */
export async function ForMastersPage() {
  const t = await getTranslations('forMasters');
  const features = [
    { icon: Inbox, title: t('features.leadsTitle'), text: t('features.leadsText') },
    { icon: ChartColumn, title: t('features.analyticsTitle'), text: t('features.analyticsText') },
    { icon: ShieldCheck, title: t('features.trustTitle'), text: t('features.trustText') },
    { icon: CalendarClock, title: t('features.scheduleTitle'), text: t('features.scheduleText') },
  ];
  const plans = [
    { name: t('planFree'), price: t('planFreePrice'), text: t('planFreeText'), items: t.raw('free') as string[], icon: Check, featured: false },
    { name: t('planPro'), price: t('planProPrice'), text: t('planProText'), items: t.raw('pro') as string[], icon: Crown, featured: true },
    { name: t('planPromo'), price: t('planPromoPrice'), text: t('planPromoText'), items: t.raw('promo') as string[], icon: Megaphone, featured: false },
  ];
  return (
    <div className="flex flex-col gap-16 pb-10">
      <section className="relative isolate overflow-hidden">
        <GradientRibbon className="absolute -right-40 top-0 -z-10 h-[420px] w-[900px] opacity-60" />
        <Container className="grid items-center gap-10 pt-12 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <Badge tone="accent" size="lg">{t('eyebrow')}</Badge>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              {t('title')} <span className="text-gradient">{t('titleAccent')}</span>
            </h1>
            <p className="mt-5 max-w-xl text-[17px] text-muted">{t('subtitle')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={routes.login(routes.cabinet.root())} className={buttonVariants({ size: 'lg' })}>
                {t('cta')}
                <ArrowRight />
              </Link>
              <Link href={routes.cabinet.root()} className={buttonVariants({ size: 'lg', variant: 'secondary' })}>
                {t('ctaCabinet')}
              </Link>
            </div>
          </div>
          <DeviceIllustration variant="diagnostics" hue={265} className="mx-auto hidden h-80 w-auto animate-float lg:block" />
        </Container>
      </section>

      <Container>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Card key={feature.title} className="p-5">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-brand text-white shadow-glow">
                <feature.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-bold">{feature.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{feature.text}</p>
            </Card>
          ))}
        </div>
      </Container>

      <Container>
        <SectionHeader title={t('plans')} description={t('billingNote')} />
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.name} variant={plan.featured ? 'gradient' : 'default'} className={cn('flex flex-col p-6', plan.featured && 'shadow-glow')}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-lg font-bold">
                  <plan.icon className="size-5 text-accent" aria-hidden />
                  {plan.name}
                </span>
                {plan.featured ? <Badge tone="solid">Популярно</Badge> : null}
              </div>
              <div className="mt-4 text-3xl font-extrabold tracking-tight">{plan.price}</div>
              <p className="mt-1 text-sm text-muted">{plan.text}</p>
              <ul className="mt-5 flex flex-col gap-2.5 text-sm">
                {plan.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <p className="mt-5 text-sm text-subtle">{t('future')}</p>
      </Container>
    </div>
  );
}
