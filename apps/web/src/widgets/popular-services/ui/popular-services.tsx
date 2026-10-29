import type { Service } from '@masterly/contracts';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ServiceCard } from '@/entities/catalog';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { Container, SectionHeader } from '@/shared/ui';

export function PopularServices({ services, city, limit = 8 }: { services: Service[]; city: string; limit?: number }) {
  const t = useTranslations();
  return (
    <section>
      <Container>
        <SectionHeader
          title={t('home.popular')}
          description={t('home.popularText')}
          action={
            <Link href={routes.search({ city })} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline dark:text-accent-2">
              {t('common.showAll')}
              <ArrowRight className="size-4" />
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {services.slice(0, limit).map((service, i) => (
            <ServiceCard key={service.id} service={service} href={routes.landing(city, service.slug)} className="animate-rise" />
          ))}
        </div>
      </Container>
    </section>
  );
}
