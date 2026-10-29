import type { Service } from '@masterly/contracts';
import { ArrowRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n';
import { cn, formatPrice } from '@/shared/lib';
import { DeviceIllustration } from '@/shared/ui';
import { hueFor, illustrationFor } from '../lib/illustration';

/** Карточка услуги в духе референса: «фото» неисправности, название, цена «от» и стрелка. */
export function ServiceCard({ service, href, className }: { service: Service; href: string; className?: string }) {
  const t = useTranslations('common');
  const locale = useLocale();
  const hue = hueFor(service.id);
  return (
    <Link
      href={href}
      className={cn(
        'group relative isolate flex aspect-[4/3.1] flex-col justify-end overflow-hidden rounded-3xl border border-line bg-surface p-4 shadow-card transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-float sm:p-5',
        className,
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-90 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: `radial-gradient(120% 90% at 70% 15%, hsl(${hue} 80% 55% / 0.28), transparent 60%), linear-gradient(180deg, transparent 35%, var(--surface) 92%)` }}
      />
      <DeviceIllustration
        variant={illustrationFor(service.id)}
        hue={hue}
        className="absolute -right-3 -top-2 -z-10 h-[78%] w-auto transition-transform duration-500 ease-out group-hover:-translate-y-1 group-hover:rotate-[-3deg] group-hover:scale-[1.04]"
      />
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-[15px] font-bold leading-tight sm:text-base">{service.name}</h3>
          <p className="mt-1 text-[13px] font-medium text-muted">
            {service.priceFrom === 0 ? t('free') : t('priceFrom', { price: formatPrice(service.priceFrom, locale) })}
          </p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-2/80 text-fg backdrop-blur transition-colors duration-300 group-hover:border-transparent group-hover:bg-brand group-hover:text-white">
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
