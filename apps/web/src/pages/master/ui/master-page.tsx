import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MasterProfileView } from '@/widgets/master-profile';
import { masterQueries } from '@/entities/master';
import { isApiError } from '@/shared/api';
import { getServerQueryClient, serverApiCall } from '@/shared/server';
import { routes, siteConfig } from '@/shared/config';
import { JsonLd } from '@/shared/lib';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const pick = (value: string | string[] | undefined) => (typeof value === 'string' && value ? value : undefined);

async function loadMaster(slug: string, context: { service?: string; model?: string }) {
  try {
    return await serverApiCall('master', { params: { slug }, query: context });
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMasterMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const master = await loadMaster(slug, {});
  const title = `${master.name} — ремонт смартфонов, ${master.districtName}`;
  const description = `${master.tagline}. Рейтинг ${master.rating.toFixed(1)} по ${master.reviewsCount} отзывам, гарантия, цены на ремонт. Оплата напрямую мастеру.`;
  return { title, description, alternates: { canonical: routes.master(slug) }, openGraph: { title, description, type: 'profile' } };
}

export async function MasterPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const context = { service: pick(query.service), model: pick(query.model) };
  const queryClient = getServerQueryClient();
  const master = await loadMaster(slug, context);
  queryClient.setQueryData(masterQueries.detail(slug, context).queryKey, master);
  const [similar] = await Promise.all([
    serverApiCall('similarMasters', { params: { id: master.id } }),
    queryClient.prefetchInfiniteQuery({
      ...masterQueries.reviews(master.id, {}),
      queryFn: ({ pageParam }) => serverApiCall('masterReviews', { params: { id: master.id }, query: { cursor: pageParam, limit: 6 } }),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MasterProfileView slug={slug} context={context} similar={similar} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'MobilePhoneStore',
          name: master.name,
          description: master.about,
          url: `${siteConfig.url}${routes.master(slug)}`,
          address: { '@type': 'PostalAddress', streetAddress: master.address, addressCountry: 'RU' },
          geo: { '@type': 'GeoCoordinates', latitude: master.location.lat, longitude: master.location.lng },
          aggregateRating: { '@type': 'AggregateRating', ratingValue: master.rating, reviewCount: master.reviewsCount, bestRating: 5 },
          priceRange: '₽₽',
          paymentAccepted: master.paymentMethods.join(', '),
        }}
      />
    </HydrationBoundary>
  );
}
