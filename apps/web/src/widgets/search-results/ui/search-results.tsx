'use client';

import type { Interpretation, SearchResponse } from '@masterly/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SearchX, Send, Sparkles, Zap } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { CompareToggle } from '@/features/compare-masters';
import { useLeadWizard } from '@/features/create-lead';
import { useSearchFilters } from '@/features/filter-masters';
import { FavoriteButton } from '@/features/toggle-favorite';
import { MasterCard, MasterCardSkeleton, masterQueries } from '@/entities/master';
import { cn, formatPrice } from '@/shared/lib';
import { Badge, Button, EmptyState, Progress } from '@/shared/ui';

function InterpretationBanner({ interpretation }: { interpretation: Interpretation }) {
  const t = useTranslations();
  const locale = useLocale();
  const top = interpretation.services[0];
  if (!top && !interpretation.model) return null;
  return (
    <div className="relative overflow-hidden rounded-3xl border-gradient p-4 sm:p-5">
      <div aria-hidden className="absolute -right-16 -top-16 size-48 rounded-full bg-accent/25 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold">
          <Sparkles className="size-4 text-accent" aria-hidden />
          {t('search.understood')}:
        </span>
        {top ? <Badge tone="accent" size="lg">{top.name}</Badge> : null}
        {interpretation.model ? <Badge tone="info" size="lg">{interpretation.model.name}</Badge> : null}
        {interpretation.urgent ? (
          <Badge tone="warning" size="lg">
            <Zap aria-hidden />
            {t('search.urgent')}
          </Badge>
        ) : null}
        <span className="ml-auto flex items-center gap-2 text-xs text-muted">
          <Progress value={interpretation.confidence * 100} className="h-1.5 w-16" />
          {t('search.confidence', { value: `${Math.round(interpretation.confidence * 100)}%` })}
        </span>
      </div>
      {interpretation.priceHint ? (
        <p className="relative mt-2 text-[13px] text-muted">
          {t('search.priceHint', {
            from: formatPrice(interpretation.priceHint.from, locale),
            to: formatPrice(interpretation.priceHint.to, locale),
            median: formatPrice(interpretation.priceHint.median, locale),
          })}{' '}
          · {t('search.notWhat')}
        </p>
      ) : null}
    </div>
  );
}

/** Выдача: бесконечная прокрутка (keyset-курсоры), SSR первой страницы, слоты фич в карточке. */
export function SearchResults({ onFirstPage }: { onFirstPage?: (page: SearchResponse) => void }) {
  const t = useTranslations();
  const { params, setFilters } = useSearchFilters();
  const openWizard = useLeadWizard((s) => s.openWizard);
  const query = useInfiniteQuery(masterQueries.search(params));
  const sentinel = useRef<HTMLDivElement>(null);
  const first = query.data?.pages[0];

  useEffect(() => {
    if (first) onFirstPage?.(first);
  }, [first, onFirstPage]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: '600px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <MasterCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const interpretation = first?.interpretation;
  const service = interpretation?.services[0];

  return (
    <div className={cn('flex flex-col gap-3 transition-opacity duration-300', query.isPlaceholderData && 'opacity-60')}>
      {interpretation ? <InterpretationBanner interpretation={interpretation} /> : null}
      {items.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title={t('search.empty.title')}
          description={t('search.empty.text')}
          action={
            <Button variant="secondary" onClick={() => void setFilters({ service: null, model: null, brand: null, priceMax: null, ratingMin: null, warrantyMin: null, openNow: null, verified: null, express: null, visit: null, parts: null, q: null })}>
              {t('search.empty.reset')}
            </Button>
          }
        />
      ) : null}
      {items.map((master) => (
        <MasterCard
          key={master.id}
          master={master}
          className="animate-rise"
          hrefQuery={{ service: params.service, model: params.model }}
          priceCaption={master.price && (service || params.service) ? [service?.name, interpretation?.model?.name].filter(Boolean).join(' · ') : undefined}
          topActions={
            <>
              <CompareToggle master={master} />
              <FavoriteButton masterId={master.id} />
            </>
          }
          primaryAction={
            <Button
              size="sm"
              onClick={() =>
                openWizard({
                  masterIds: [master.id],
                  masterNames: [master.name],
                  serviceId: master.price?.serviceId ?? service?.id ?? null,
                  modelId: master.price?.modelId ?? interpretation?.model?.id ?? null,
                  description: params.q,
                  urgent: interpretation?.urgent,
                })
              }
            >
              <Send />
              {t('master.requestShort')}
            </Button>
          }
        />
      ))}
      <div ref={sentinel} />
      {query.isFetchingNextPage ? <MasterCardSkeleton /> : null}
      {query.hasNextPage && !query.isFetchingNextPage ? (
        <Button variant="secondary" className="mx-auto mt-2" onClick={() => void query.fetchNextPage()}>
          {t('search.loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
