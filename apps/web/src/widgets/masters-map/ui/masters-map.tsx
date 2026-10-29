'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapPin } from '@masterly/contracts';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Star, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import MapGL, { GeolocateControl, Marker, NavigationControl, type MapRef } from 'react-map-gl/maplibre';
import { cityQueries } from '@/entities/city';
import { masterQueries, PricePin, useMasterHighlight, type SearchParams } from '@/entities/master';
import { routes } from '@/shared/config';
import { Link } from '@/shared/i18n';
import { cn, formatPrice } from '@/shared/lib';
import { buttonVariants, Skeleton } from '@/shared/ui';

const STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

/**
 * Карта на MapLibre GL (WebGL, векторные тайлы). На десятках тысяч объектов шлюз отдаёт
 * агрегаты geotile_grid из OpenSearch; в городе MVP достаточно HTML-маркеров с ценой.
 */
export function MastersMap({ params, city, className }: { params: SearchParams; city: string; className?: string }) {
  const t = useTranslations('common');
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const mapRef = useRef<MapRef>(null);
  const { data } = useQuery(masterQueries.map(params));
  const { data: cities } = useQuery(cityQueries.list());
  const cityData = cities?.find((c) => c.slug === city);
  const [zoom, setZoom] = useState(cityData?.zoom ?? 10.5);
  const hoveredId = useMasterHighlight((s) => s.hoveredId);
  const selectedId = useMasterHighlight((s) => s.selectedId);
  const hover = useMasterHighlight((s) => s.hover);
  const select = useMasterHighlight((s) => s.select);
  const selected = data?.pins.find((pin) => pin.id === selectedId) ?? null;

  useEffect(() => {
    if (cityData) mapRef.current?.flyTo({ center: [cityData.center.lng, cityData.center.lat], zoom: cityData.zoom, duration: 900 });
  }, [cityData]);

  useEffect(() => {
    const pin = data?.pins.find((p) => p.id === hoveredId);
    const map = mapRef.current;
    if (!pin || !map) return;
    const bounds = map.getBounds();
    if (!bounds.contains([pin.location.lng, pin.location.lat])) map.easeTo({ center: [pin.location.lng, pin.location.lat], duration: 500 });
  }, [hoveredId, data]);

  if (!cityData) return <Skeleton className={cn('h-full rounded-3xl', className)} />;

  const sorted: MapPin[] = [...(data?.pins ?? [])].sort((a, b) => Number(a.promoted) - Number(b.promoted));

  return (
    <div className={cn('relative isolate overflow-hidden rounded-3xl border border-line bg-surface-2', className)}>
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: cityData.center.lng, latitude: cityData.center.lat, zoom: cityData.zoom }}
        mapStyle={resolvedTheme === 'light' ? STYLES.light : STYLES.dark}
        style={{ width: '100%', height: '100%' }}
        onZoom={(event) => setZoom(event.viewState.zoom)}
        onClick={() => select(null)}
        attributionControl={{ compact: true }}
        reuseMaps
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <GeolocateControl position="bottom-right" />
        {sorted.map((pin) => {
          const active = pin.id === hoveredId || pin.id === selectedId;
          return (
            <Marker
              key={pin.id}
              longitude={pin.location.lng}
              latitude={pin.location.lat}
              anchor="bottom"
              style={{ zIndex: active ? 20 : pin.promoted ? 5 : 1 }}
              onClick={(event) => {
                event.originalEvent.stopPropagation();
                select(pin.id);
              }}
            >
              <button type="button" aria-label={pin.name} onMouseEnter={() => hover(pin.id)} onMouseLeave={() => hover(null)}>
                <PricePin price={pin.price} rating={pin.rating} active={active} promoted={pin.promoted} compact={zoom < 11 && !active} locale={locale} />
              </button>
            </Marker>
          );
        })}
      </MapGL>

      {selected ? (
        <div className="glass absolute inset-x-3 bottom-3 z-10 flex items-center gap-3 rounded-2xl border border-line-strong p-3 shadow-float animate-rise sm:left-3 sm:right-auto sm:w-80">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{selected.name}</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <span className="inline-flex items-center gap-0.5">
                <Star className="size-3 fill-amber-400 text-amber-400" strokeWidth={0} />
                {selected.rating.toFixed(1)}
              </span>
              {selected.price !== null ? <span>{selected.price === 0 ? t('free') : t('priceFrom', { price: formatPrice(selected.price, locale) })}</span> : null}
            </div>
          </div>
          <Link href={routes.master(selected.slug, { service: params.service, model: params.model })} className={buttonVariants({ size: 'sm' })}>
            <ArrowRight />
          </Link>
          <button type="button" onClick={() => select(null)} className="rounded-full p-1 text-subtle hover:text-fg" aria-label={t('close')}>
            <X className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
