'use client';

import type { Interpretation, Suggestion } from '@masterly/contracts';
import { useQuery } from '@tanstack/react-query';
import { Clock3, CornerDownLeft, MapPin, Search, Smartphone, Sparkles, Wrench, X, Zap } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, type KeyboardEvent } from 'react';
import { useCurrentCity } from '@/entities/city';
import { masterQueries } from '@/entities/master';
import { routes } from '@/shared/config';
import { useRouter } from '@/shared/i18n';
import { cn, formatPrice, track } from '@/shared/lib';
import { useClickOutside, useDebouncedValue } from '@/shared/lib/hooks';
import { Badge, Button, Kbd, Spinner } from '@/shared/ui';
import { useRecentSearches } from '../model/recent-searches';
import { useTypewriter } from '../model/use-typewriter';

const EXAMPLES = ['разбил экран iPhone 13', 'быстро садится Samsung A54', 'не заряжается Redmi Note 13', 'уронил в воду iPhone 15 Pro', 'не работает Face ID', 'треснуло стекло камеры'];

const ICONS: Record<Suggestion['type'], typeof Search> = { problem: Sparkles, service: Wrench, model: Smartphone, master: MapPin, recent: Clock3 };

export function InterpretationChips({ interpretation, className }: { interpretation: Interpretation; className?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const top = interpretation.services[0];
  if (!top && !interpretation.model) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span className="mr-0.5 inline-flex items-center gap-1 text-xs font-semibold text-muted">
        <Sparkles className="size-3.5 text-accent" aria-hidden />
        {t('suggest.detected')}:
      </span>
      {top ? <Badge tone="accent">{top.name}</Badge> : null}
      {interpretation.model ? <Badge tone="info">{interpretation.model.name}</Badge> : null}
      {interpretation.priceHint ? <Badge tone="success">{t('common.priceFrom', { price: formatPrice(interpretation.priceHint.from, locale) })}</Badge> : null}
      {interpretation.priceHint ? <Badge>{t('common.masters', { count: interpretation.priceHint.mastersCount })}</Badge> : null}
      {interpretation.urgent ? (
        <Badge tone="warning">
          <Zap aria-hidden />
          {t('search.urgent')}
        </Badge>
      ) : null}
    </div>
  );
}

export interface SmartSearchProps {
  variant?: 'hero' | 'compact';
  defaultValue?: string;
  autoFocus?: boolean;
  className?: string;
  onNavigate?: () => void;
}

/** Поиск «по проблеме»: свободный текст → услуга + модель + цена, подсказки, клавиатурная навигация. */
export function SmartSearch({ variant = 'hero', defaultValue = '', autoFocus, className, onNavigate }: SmartSearchProps) {
  const t = useTranslations();
  const router = useRouter();
  const { slug: city } = useCurrentCity();
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const recent = useRecentSearches();
  const debounced = useDebouncedValue(value.trim(), 200);
  const { data, isFetching } = useQuery({ ...masterQueries.suggest(debounced, city), enabled: open && debounced.length >= 2 });
  const containerRef = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const typed = useTypewriter(EXAMPLES, !value && !focused);
  const hero = variant === 'hero';

  const items: Suggestion[] =
    debounced.length >= 2
      ? (data?.suggestions ?? [])
      : recent.items.map((q) => ({ type: 'recent' as const, id: q, title: q, subtitle: null, query: { q } }));

  const go = (query: Record<string, string>) => {
    setOpen(false);
    onNavigate?.();
    if (query.master) {
      router.push(routes.master(query.master));
      return;
    }
    if (query.q) recent.add(query.q);
    track('search_submit', { q: query.q ?? null, service: query.service ?? null, model: query.model ?? null });
    router.push(routes.search({ ...query, city }));
  };

  const submit = () => {
    const selected = active >= 0 ? items[active] : undefined;
    if (selected) go(selected.query);
    else if (value.trim()) go({ q: value.trim() });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (items.length ? (i + 1) % items.length : -1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : -1));
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const showPanel = open && (items.length > 0 || (debounced.length >= 2 && isFetching));

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className={cn(
          'group relative flex items-center gap-2 border border-line bg-surface/85 shadow-card backdrop-blur-xl transition-[border-color,box-shadow] duration-300 focus-within:border-accent/50 focus-within:shadow-glow',
          hero ? 'h-[60px] rounded-[22px] pl-5 pr-2 sm:h-16' : 'h-11 rounded-2xl pl-3.5 pr-1.5',
        )}
      >
        <Search className={cn('shrink-0 text-subtle transition-colors group-focus-within:text-accent', hero ? 'size-5' : 'size-4')} aria-hidden />
        <input
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label={t('search.placeholder')}
          autoFocus={autoFocus}
          value={value}
          placeholder={hero ? (focused ? t('home.searchPlaceholder') : typed) : t('search.placeholder')}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => {
            setFocused(true);
            setOpen(true);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          className={cn('h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-subtle', hero ? 'text-[16px] sm:text-[17px]' : 'text-sm')}
        />
        {value ? (
          <button type="button" onClick={() => setValue('')} className="rounded-full p-1.5 text-subtle transition hover:bg-surface-2 hover:text-fg" aria-label={t('common.reset')}>
            <X className="size-4" />
          </button>
        ) : null}
        {hero ? (
          <Button type="submit" size="icon-lg" className="size-12 rounded-[16px] shadow-glow" aria-label={t('home.searchCta')}>
            <Search />
          </Button>
        ) : (
          <Button type="submit" size="icon-sm" aria-label={t('home.searchCta')}>
            <Search />
          </Button>
        )}
      </form>

      {showPanel ? (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-40 mt-2 max-h-[min(70dvh,520px)] overflow-y-auto rounded-3xl border border-line bg-elevated p-2 shadow-float animate-pop"
        >
          {data?.interpretation && debounced.length >= 2 ? (
            <InterpretationChips interpretation={data.interpretation} className="border-b border-line px-2.5 pb-2.5 pt-1.5" />
          ) : null}
          {items.length === 0 ? <Spinner className="p-3" label={t('common.loading')} /> : null}
          <ul className="mt-1">
            {items.map((item, i) => {
              const Icon = ICONS[item.type];
              return (
                <li key={`${item.type}-${item.id}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item.query)}
                    className={cn('flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors', i === active ? 'bg-surface-2' : 'hover:bg-surface-2')}
                  >
                    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', item.type === 'problem' ? 'bg-brand text-white' : 'bg-surface-3 text-muted')}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{item.title}</span>
                      {item.subtitle ? <span className="block truncate text-xs text-muted">{item.subtitle}</span> : null}
                    </span>
                    <span className="hidden text-[11px] font-medium text-subtle sm:block">{t(`suggest.${item.type}`)}</span>
                    {i === active ? <CornerDownLeft className="size-3.5 text-subtle" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="hidden items-center gap-3 border-t border-line px-3 pt-2 text-[11px] text-subtle sm:flex">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> навигация
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Enter</Kbd> выбрать
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Esc</Kbd> закрыть
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
