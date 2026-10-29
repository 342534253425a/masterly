import type { MasterCard } from '@masterly/contracts';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MasterMiniCard } from '@/entities/master';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { Container, SectionHeader } from '@/shared/ui';

export function TopMasters({ masters, city, title, description }: { masters: MasterCard[]; city: string; title?: string; description?: string }) {
  const t = useTranslations();
  return (
    <section>
      <Container>
        <SectionHeader
          title={title ?? t('home.topMasters')}
          description={description ?? t('home.topMastersText')}
          action={
            <Link href={routes.search({ city, sort: 'rating' })} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline dark:text-accent-2">
              {t('common.showAll')}
              <ArrowRight className="size-4" />
            </Link>
          }
        />
      </Container>
      <div className="scrollbar-none mask-fade-x mx-auto flex max-w-[1320px] snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:gap-4 sm:px-6 lg:px-8">
        {masters.map((master) => (
          <MasterMiniCard key={master.id} master={master} className="snap-start" />
        ))}
      </div>
    </section>
  );
}
