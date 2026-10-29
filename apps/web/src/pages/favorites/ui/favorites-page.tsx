'use client';

import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CompareToggle } from '@/features/compare-masters';
import { favoriteQueries, FavoriteButton } from '@/features/toggle-favorite';
import { MasterCard, MasterCardSkeleton } from '@/entities/master';
import { useSession } from '@/entities/session';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { buttonVariants, Container, EmptyState, PageHeader } from '@/shared/ui';

export function FavoritesPage() {
  const t = useTranslations('favorites');
  const tNav = useTranslations('nav');
  const { isAuthenticated, isLoading } = useSession();
  const { data, isPending } = useQuery({ ...favoriteQueries.list(), enabled: isAuthenticated });
  return (
    <Container className="max-w-4xl py-8">
      <PageHeader title={t('title')} description={t('subtitle')} />
      {!isLoading && !isAuthenticated ? (
        <EmptyState
          icon={<Heart />}
          title={t('loginRequired')}
          action={
            <Link href={routes.login(routes.favorites())} className={buttonVariants()}>
              {tNav('login')}
            </Link>
          }
        />
      ) : null}
      {isAuthenticated && isPending ? <MasterCardSkeleton /> : null}
      {data?.length === 0 ? <EmptyState icon={<Heart />} title={t('empty')} description={t('emptyText')} /> : null}
      <div className="flex flex-col gap-3">
        {data?.map((master) => (
          <MasterCard
            key={master.id}
            master={master}
            topActions={
              <>
                <CompareToggle master={master} />
                <FavoriteButton masterId={master.id} />
              </>
            }
          />
        ))}
      </div>
    </Container>
  );
}
