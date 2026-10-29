import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppShell, SiteFooter } from '@/widgets/app-shell';
import { getServerCity } from '@/shared/server';
import { REALTIME_URL, siteConfig } from '@/shared/config';
import { routing } from '@/shared/i18n';
import { AppProviders } from '../runtime/app-providers';
import '../styles/globals.css';

const manrope = Manrope({ subsets: ['latin', 'cyrillic'], variable: '--font-manrope', display: 'swap' });

export async function generateRootMetadata(requested: string): Promise<Metadata> {
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    metadataBase: new URL(siteConfig.url),
    title: { default: t('title'), template: t('titleTemplate') },
    description: t('description'),
    applicationName: siteConfig.name,
    alternates: {
      canonical: locale === routing.defaultLocale ? '/' : `/${locale}`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, l === routing.defaultLocale ? '/' : `/${l}`])),
    },
    openGraph: { type: 'website', siteName: siteConfig.name, locale, title: t('title'), description: t('description') },
    twitter: { card: 'summary_large_image' },
    appleWebApp: { capable: true, title: siteConfig.name, statusBarStyle: 'black-translucent' },
    formatDetection: { telephone: false },
  };
}

export const rootViewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#06060c' },
    { media: '(prefers-color-scheme: light)', color: '#f5f5fa' },
  ],
};

export async function RootLayout({ children, locale }: { children: ReactNode; locale: string }) {
  const initialCity = await getServerCity();
  return (
    <html lang={locale} className={manrope.variable} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider>
          <AppProviders initialCity={initialCity} realtimeUrl={REALTIME_URL}>
            <AppShell footer={<SiteFooter />}>{children}</AppShell>
          </AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
