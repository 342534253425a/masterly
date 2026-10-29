import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { loadSearchFilters, toSearchParams } from '@/features/filter-masters';
import { masterQueries } from '@/entities/master';
import { getServerCity, getServerQueryClient, serverApiCall } from '@/shared/server';
import { SearchView } from './search-view';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateSearchMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const t = await getTranslations('search');
  const { q } = await loadSearchFilters(searchParams);
  return { title: q ? `${q} — ${t('title')}` : t('title'), robots: { index: !q, follow: true } };
}

/** SSR первой страницы выдачи + гидратация React Query: контент сразу в HTML, дальше — клиентская навигация. */
export async function SearchPage({ searchParams }: PageProps) {
  const filters = await loadSearchFilters(searchParams);
  const params = toSearchParams(filters, await getServerCity());
  const queryClient = getServerQueryClient();
  await queryClient.prefetchInfiniteQuery({
    ...masterQueries.search(params),
    queryFn: ({ pageParam }) => serverApiCall('search', { query: { ...params, cursor: pageParam, limit: 12 } }),
  });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SearchView />
    </HydrationBoundary>
  );
}
