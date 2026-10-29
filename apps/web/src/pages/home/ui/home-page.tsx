import { AiBanner } from '@/widgets/ai-banner';
import { ComingSoon } from '@/widgets/coming-soon';
import { HomeHero } from '@/widgets/home-hero';
import { PopularServices } from '@/widgets/popular-services';
import { TopMasters } from '@/widgets/top-masters';
import { getServerCity, serverApiCall } from '@/shared/server';
import { siteConfig } from '@/shared/config';
import { JsonLd } from '@/shared/lib';
import { HowItWorks, MasterCta, TrustSection } from './sections';

export async function HomePage() {
  const city = await getServerCity();
  const [services, categories, top, landing] = await Promise.all([
    serverApiCall('services', { query: { city } }),
    serverApiCall('categories', {}),
    serverApiCall('search', { query: { city, sort: 'rating', limit: 10 } }),
    serverApiCall('landing', { query: { city } }),
  ]);

  return (
    <div className="flex flex-col gap-14 pb-4 sm:gap-20">
      <HomeHero city={city} stats={{ masters: landing.stats.mastersCount, rating: landing.stats.avgRating, responseMin: landing.stats.avgResponseMin }} />
      <AiBanner />
      <PopularServices services={services} city={city} />
      <TopMasters masters={top.items} city={city} />
      <HowItWorks />
      <TrustSection />
      <ComingSoon categories={categories} />
      <MasterCta />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: siteConfig.name,
          url: siteConfig.url,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${siteConfig.url}/search?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        }}
      />
    </div>
  );
}
