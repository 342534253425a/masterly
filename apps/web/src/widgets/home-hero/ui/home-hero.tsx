import { BatteryLow, Camera, Droplets, PlugZap, ScanFace, Smartphone } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { SmartSearch } from '@/features/search-by-problem';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { formatNumber } from '@/shared/lib';
import { Badge, Container } from '@/shared/ui';
import { HeroVisual } from './hero-visual';

const QUICK = [
  { q: 'разбил экран', label: 'Разбит экран', icon: Smartphone },
  { q: 'не заряжается', label: 'Не заряжается', icon: PlugZap },
  { q: 'быстро садится', label: 'Быстро садится', icon: BatteryLow },
  { q: 'упал в воду', label: 'Побывал в воде', icon: Droplets },
  { q: 'не фокусируется камера', label: 'Камера', icon: Camera },
  { q: 'не работает face id', label: 'Face ID', icon: ScanFace },
];

export function HomeHero({ city, stats }: { city: string; stats: { masters: number; rating: number; responseMin: number } }) {
  const t = useTranslations('home');
  const locale = useLocale();
  return (
    <section className="relative">
      <Container className="relative pb-8 pt-8 sm:pb-12 sm:pt-14">
        <div className="grid items-center gap-10 lg:grid-cols-[1.3fr_1fr]">
          <div className="animate-rise">
            <Badge tone="accent" size="lg" className="mb-5 max-w-full">
              <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-current" />
              <span className="truncate">{t('eyebrow')}</span>
            </Badge>
            <h1 className="text-[40px] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-[58px] lg:text-[64px]">
              {t('titleStart')} <span className="text-gradient">{t('titleAccent')}</span>
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">{t('subtitle')}</p>
            <SmartSearch variant="hero" className="mt-8 max-w-2xl" />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[13px] text-subtle">{t('quickTitle')}</span>
              {QUICK.map(({ q, label, icon: Icon }) => (
                <Link
                  key={q}
                  href={routes.search({ q, city })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-3 text-[12.5px] font-medium text-muted transition hover:border-accent/40 hover:text-fg"
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </Link>
              ))}
            </div>
            <dl className="mt-10 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              {[
                { value: formatNumber(stats.masters, locale), label: t('stats.masters') },
                { value: `${stats.rating.toFixed(2)} ★`, label: t('stats.rating') },
                { value: `~${stats.responseMin} мин`, label: t('stats.response') },
                { value: '0%', label: t('stats.commission') },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="sr-only">{item.label}</dt>
                  <dd className="text-2xl font-extrabold tracking-tight">{item.value}</dd>
                  <dd className="mt-0.5 text-[13px] text-subtle">{item.label}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HeroVisual />
        </div>
      </Container>
    </section>
  );
}
