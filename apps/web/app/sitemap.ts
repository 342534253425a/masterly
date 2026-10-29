import type { MetadataRoute } from 'next';
import { serverApiCall } from '@/shared/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100';

export const revalidate = 3600;

/**
 * Карта сайта: статические страницы, SEO-страницы «город × услуга» и профили мастеров.
 * При росте до миллионов URL — sitemap index (generateSitemaps) с шардами по 50 000 записей,
 * сформированными офлайн из read-модели каталога.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [cities, services] = await Promise.all([serverApiCall('cities', {}), serverApiCall('services', {})]);
  const staticPages = ['', '/search', '/for-masters', '/help'].map((path) => ({ url: `${SITE_URL}${path}`, lastModified: now, changeFrequency: 'daily' as const, priority: path ? 0.7 : 1 }));
  const landings = cities.flatMap((city) => [
    { url: `${SITE_URL}/${city.slug}`, lastModified: now, changeFrequency: 'daily' as const, priority: 0.9 },
    ...services.map((service) => ({ url: `${SITE_URL}/${city.slug}/${service.slug}`, lastModified: now, changeFrequency: 'daily' as const, priority: 0.8 })),
  ]);
  const masters = (
    await Promise.all(
      cities.map(async (city) => {
        const items: Array<{ slug: string }> = [];
        let cursor: string | undefined;
        do {
          const page = await serverApiCall('search', { query: { city: city.slug, limit: 50, cursor } });
          items.push(...page.items);
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        return items;
      }),
    )
  )
    .flat()
    .map((master) => ({ url: `${SITE_URL}/masters/${master.slug}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.6 }));
  return [...staticPages, ...landings, ...masters];
}
