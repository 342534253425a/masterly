import type { Landing } from '@masterly/contracts';
import { ArrowRight, Clock, MapPinned, Star, Users, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { PopularServices } from '@/widgets/popular-services';
import { TopMasters } from '@/widgets/top-masters';
import { hueFor, illustrationFor } from '@/entities/catalog';
import { isApiError } from '@/shared/api';
import { serverApiCall } from '@/shared/server';
import { routes, siteConfig } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { formatPrice, JsonLd } from '@/shared/lib';
import { buttonVariants, Card, Container, DeviceIllustration, GlowOrb, SectionHeader } from '@/shared/ui';

type Params = { city: string; service?: string; model?: string };
type Props = { params: Promise<Params> };

async function load(params: Params): Promise<Landing> {
  try {
    return await serverApiCall('landing', { query: { city: params.city, service: params.service, model: params.model } });
  } catch (error) {
    if (isApiError(error) && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}

function heading(landing: Landing, t: Awaited<ReturnType<typeof getTranslations<'landing'>>>) {
  if (landing.service && landing.model) return t('titleModel', { service: landing.service.name, model: landing.model.name, city: landing.city.nameIn });
  if (landing.service) return t('title', { service: landing.service.name, city: landing.city.nameIn });
  return t('titleCity', { city: landing.city.nameIn });
}

/** SEO-страницы «услуга × город × модель»: уникальный контент из реальных данных, FAQ и разметка schema.org. */
export async function generateLandingMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await params;
  if (!/^[a-z0-9-]+$/.test(resolved.city)) notFound();
  const landing = await load(resolved);
  const t = await getTranslations('landing');
  const title = heading(landing, t);
  const description = `${landing.stats.mastersCount} проверенных мастеров, цены от ${formatPrice(landing.stats.priceFrom)}, средний рейтинг ${landing.stats.avgRating.toFixed(1)}. Отзывы, гарантия, оплата напрямую мастеру.`;
  return { title, description, alternates: { canonical: routes.landing(resolved.city, resolved.service, resolved.model) }, openGraph: { title, description } };
}

export async function LandingPage({ params }: Props) {
  const resolved = await params;
  if (!/^[a-z0-9-]+$/.test(resolved.city)) notFound();
  const [landing, services] = await Promise.all([load(resolved), serverApiCall('services', { query: { city: resolved.city } })]);
  if (landing.city.slug !== resolved.city) notFound();
  const t = await getTranslations('landing');
  const locale = await getLocale();
  const title = heading(landing, t);
  const stats = [
    { icon: Users, label: t('statsMasters'), value: String(landing.stats.mastersCount) },
    { icon: Wallet, label: t('statsPrice'), value: landing.stats.priceFrom ? formatPrice(landing.stats.priceFrom, locale) : '—' },
    { icon: Wallet, label: t('statsMedian'), value: landing.stats.priceMedian ? formatPrice(landing.stats.priceMedian, locale) : '—' },
    { icon: Star, label: t('statsRating'), value: landing.stats.avgRating.toFixed(2) },
    { icon: Clock, label: t('statsResponse'), value: `~${landing.stats.avgResponseMin} мин` },
  ];

  return (
    <div className="flex flex-col gap-14 pb-8">
      <section className="relative isolate overflow-hidden">
        <GlowOrb className="absolute -left-20 -top-20 -z-10 size-96" />
        <Container className="grid items-center gap-8 pt-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <nav aria-label="breadcrumbs" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-subtle">
              <Link href={routes.home()} className="hover:text-fg">Masterly</Link>
              <span>/</span>
              <Link href={routes.landing(landing.city.slug)} className="hover:text-fg">{landing.city.name}</Link>
              {landing.service ? (
                <>
                  <span>/</span>
                  <span className="text-muted">{landing.service.name}</span>
                </>
              ) : null}
            </nav>
            <h1 className="text-[34px] font-extrabold leading-tight tracking-tight sm:text-5xl">{title}</h1>
            {landing.service ? <p className="mt-4 max-w-2xl text-[16px] text-muted">{landing.service.description}</p> : null}
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={routes.search({ city: landing.city.slug, service: landing.service?.slug, model: landing.model?.id })} className={buttonVariants({ size: 'lg' })}>
                <MapPinned />
                {t('showAll')}
              </Link>
            </div>
          </div>
          <DeviceIllustration variant={landing.service ? illustrationFor(landing.service.id) : 'screen'} hue={landing.service ? hueFor(landing.service.id) : 262} className="mx-auto hidden h-72 w-auto animate-float lg:block" />
        </Container>
        <Container className="mt-10">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {stats.map((stat) => (
              <Card key={stat.label} className="p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <stat.icon className="size-3.5 text-accent" aria-hidden /> {stat.label}
                </div>
                <div className="mt-1 text-xl font-extrabold tracking-tight">{stat.value}</div>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <TopMasters masters={landing.topMasters} city={landing.city.slug} title={t('top')} description={title} />

      {!landing.service ? <PopularServices services={services} city={landing.city.slug} limit={14} /> : null}

      <section>
        <Container className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <SectionHeader title={t('faq')} />
            <div className="flex flex-col gap-3">
              {landing.faq.map((item) => (
                <details key={item.q} className="group rounded-2xl border border-line bg-surface p-5 open:border-line-strong">
                  <summary className="cursor-pointer list-none font-semibold marker:hidden">
                    <span className="flex items-center justify-between gap-4">
                      {item.q}
                      <ArrowRight className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-90" />
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
          <div>
            <SectionHeader title={t('related')} />
            <ul className="flex flex-col gap-1.5">
              {landing.related.map((link) => (
                <li key={`${link.city}-${link.service}`}>
                  <Link href={routes.landing(link.city, link.service)} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-surface-2 hover:text-fg">
                    {link.title}
                    <ArrowRight className="size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Masterly', item: siteConfig.url },
              { '@type': 'ListItem', position: 2, name: landing.city.name, item: `${siteConfig.url}${routes.landing(landing.city.slug)}` },
              ...(landing.service ? [{ '@type': 'ListItem', position: 3, name: landing.service.name, item: `${siteConfig.url}${routes.landing(landing.city.slug, landing.service.slug)}` }] : []),
            ],
          },
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: landing.faq.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
          },
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            itemListElement: landing.topMasters.map((master, i) => ({ '@type': 'ListItem', position: i + 1, url: `${siteConfig.url}${routes.master(master.slug)}`, name: master.name })),
          },
        ]}
      />
    </div>
  );
}
