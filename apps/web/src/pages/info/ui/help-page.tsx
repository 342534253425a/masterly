import { ArrowRight, Headset, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { JsonLd } from '@/shared/lib';
import { buttonVariants, Card, Container, PageHeader, SectionHeader } from '@/shared/ui';

export async function generateHelpMetadata() {
  const t = await getTranslations('help');
  return { title: t('title'), description: t('subtitle') };
}

export async function HelpPage() {
  const t = await getTranslations('help');
  const warranty = t.raw('warranty') as Array<{ title: string; text: string }>;
  const faq = t.raw('faq') as Array<{ q: string; a: string }>;
  return (
    <Container className="flex flex-col gap-12 py-10">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <section>
        <SectionHeader title={t('warrantyTitle')} />
        <div className="grid gap-4 sm:grid-cols-2">
          {warranty.map((item) => (
            <Card key={item.title} className="p-5">
              <h3 className="flex items-center gap-2 font-bold">
                <ShieldCheck className="size-4 text-success" aria-hidden />
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.text}</p>
            </Card>
          ))}
        </div>
      </section>
      <section>
        <SectionHeader title={t('faqTitle')} />
        <div className="flex flex-col gap-3">
          {faq.map((item) => (
            <details key={item.q} className="group rounded-2xl border border-line bg-surface p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {item.q}
                <ArrowRight className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
      <Card variant="gradient" className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand text-white">
            <Headset className="size-6" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-bold">{t('contactTitle')}</h2>
            <p className="text-sm text-muted">{t('contactText')}</p>
          </div>
        </div>
        <Link href={routes.messages()} className={buttonVariants({ size: 'lg' })}>
          {t('contactCta')}
        </Link>
      </Card>
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })) }} />
    </Container>
  );
}
