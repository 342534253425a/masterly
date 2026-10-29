'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { MasterCard as MasterCardData, MapPin } from '@masterly/contracts';
import { haversineKm } from '@masterly/kernel';
import { useQuery } from '@tanstack/react-query';
import { List, Maximize2, Minimize2, RotateCcw, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { GeolocateControl, Layer, Marker, NavigationControl, Popup, Source, type MapRef } from 'react-map-gl/maplibre';
import { useSearchFilters } from '@/features/filter-masters';
import { FavoriteButton } from '@/features/toggle-favorite';
import { cityQueries } from '@/entities/city';
import { MasterCard, MasterCardSkeleton, masterQueries, PricePin, useMasterHighlight, type SearchParams } from '@/entities/master';
import { cn, formatPrice } from '@/shared/lib';
import { Button, Skeleton } from '@/shared/ui';
import { boundsOf, circlePolygon, clusterPins, type PinCluster } from '../lib/cluster';
import { useRussianMapStyle } from '../lib/map-style';

export interface MastersMapProps {
  params: SearchParams;
  city: string;
  /** Загруженные карточки выдачи: из них — мини-карточка у пина и лента на телефоне. */
  items?: MasterCardData[];
  serviceNames?: ReadonlyMap<string, string>;
  /** Режим «большая карта» на десктопе (список узкой колонкой сбоку). */
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** Телефон: лента карточек внизу вместо всплывающей карточки; кнопка «Списком». */
  carousel?: boolean;
  onShowList?: () => void;
  className?: string;
}

/** Ниже этого зума пины собираются в кластеры с числом мастеров; ближе — у каждого пина своя цена. */
const CLUSTER_UNTIL_ZOOM = 13;
const CLUSTER_RADIUS_PX = 56;

/**
 * Карта выдачи (MapLibre GL, векторные тайлы, подписи по-русски). Связана со списком в обе стороны:
 * наведение на карточку поднимает пин, клик по пину открывает мини-карточку и прокручивает список к мастеру.
 * После перемещения карты — «Искать в этой области»: центр и радиус уходят в фильтры поиска.
 */
export function MastersMap({ params, city, items = [], serviceNames, expanded, onToggleExpand, carousel, onShowList, className }: MastersMapProps) {
  const t = useTranslations('search.map');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const mapStyle = useRussianMapStyle(resolvedTheme === 'light' ? 'light' : 'dark');
  const mapRef = useRef<MapRef>(null);
  const [loaded, setLoaded] = useState(false);
  const { filters, setFilters } = useSearchFilters();
  const { data } = useQuery(masterQueries.map(params));
  const { data: cities } = useQuery(cityQueries.list());
  const cityData = cities?.find((c) => c.slug === city);
  const pins = useMemo(() => data?.pins ?? [], [data]);
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const [clusters, setClusters] = useState<Array<PinCluster<MapPin>>>([]);
  const [areaDirty, setAreaDirty] = useState(false);
  const hoveredId = useMasterHighlight((s) => s.hoveredId);
  const selectedId = useMasterHighlight((s) => s.selectedId);
  const hover = useMasterHighlight((s) => s.hover);
  const select = useMasterHighlight((s) => s.select);
  const selectedPin = pins.find((pin) => pin.id === selectedId) ?? null;
  // Мастер вне загруженной страницы выдачи — карточку для мини-окна берём из профиля (в нём все поля карточки)
  const { data: detail } = useQuery({
    ...masterQueries.detail(selectedPin?.slug ?? '', { service: params.service, model: params.model }),
    placeholderData: undefined,
    enabled: Boolean(selectedPin && !byId.has(selectedPin.id)),
  });
  const popupItem = selectedPin ? (byId.get(selectedPin.id) ?? (detail?.id === selectedPin.id ? detail : undefined)) : undefined;
  const geo = useMemo(
    () => (filters.lat !== null && filters.lng !== null ? { lat: filters.lat, lng: filters.lng, radiusKm: filters.radiusKm ?? 10 } : null),
    [filters.lat, filters.lng, filters.radiusKm],
  );

  // Кластеры пересчитываются после остановки карты, а не на каждом кадре движения
  const recluster = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const singles = () => pins.map((pin) => ({ members: [pin], lng: pin.location.lng, lat: pin.location.lat }));
    setClusters(map.getZoom() >= CLUSTER_UNTIL_ZOOM || pins.length <= 20 ? singles() : clusterPins(pins, (point) => map.project([point.lng, point.lat]), CLUSTER_RADIUS_PX));
  }, [pins]);

  useEffect(() => {
    if (loaded) recluster();
  }, [loaded, recluster]);

  // Новая выдача — карта показывает её целиком; область, выбранную пользователем, не трогаем
  const resultsKey = JSON.stringify(params);
  const fittedFor = useRef('');
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || pins.length === 0 || fittedFor.current === resultsKey) return;
    fittedFor.current = resultsKey;
    const bounds = geo ? boundsOf(circlePolygon(geo, geo.radiusKm, 16).geometry.coordinates[0]!.map(([lng, lat]) => ({ lng: lng!, lat: lat! }))) : boundsOf(pins.map((pin) => pin.location));
    if (bounds) map.fitBounds(bounds, { padding: { top: 72, bottom: carousel ? 190 : 48, left: 48, right: 48 }, maxZoom: 14.5, duration: 700 });
    setAreaDirty(false);
  }, [resultsKey, pins, loaded, geo, carousel]);

  // Наведение на карточку: пин за краем карты — плавно подвести
  useEffect(() => {
    const pin = pins.find((p) => p.id === hoveredId);
    const map = mapRef.current;
    if (!pin || !map || carousel) return;
    if (!map.getBounds().contains([pin.location.lng, pin.location.lat])) map.easeTo({ center: [pin.location.lng, pin.location.lat], duration: 450 });
  }, [hoveredId, pins, carousel]);

  // Лента на телефоне: выбранный пин ↔ карточка в ленте
  const rail = useRef<HTMLDivElement>(null);
  const fromRail = useRef(false);
  useEffect(() => {
    if (!carousel || !selectedId) return;
    if (fromRail.current) {
      fromRail.current = false;
      return;
    }
    rail.current?.querySelector(`[data-rail-id="${selectedId}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [carousel, selectedId]);

  const railTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onRailScroll = () => {
    clearTimeout(railTimer.current);
    railTimer.current = setTimeout(() => {
      const node = rail.current;
      if (!node) return;
      const center = node.scrollLeft + node.clientWidth / 2;
      const cards = [...node.querySelectorAll<HTMLElement>('[data-rail-id]')];
      const closest = cards.reduce<HTMLElement | null>((best, card) => (!best || Math.abs(card.offsetLeft + card.offsetWidth / 2 - center) < Math.abs(best.offsetLeft + best.offsetWidth / 2 - center) ? card : best), null);
      const id = closest?.dataset.railId;
      if (!id || id === useMasterHighlight.getState().selectedId) return;
      fromRail.current = true;
      select(id);
      const pin = pins.find((p) => p.id === id);
      if (pin) mapRef.current?.easeTo({ center: [pin.location.lng, pin.location.lat], duration: 400 });
    }, 120);
  };

  const searchHere = () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    const center = bounds.getCenter();
    // Круг, вписанный в видимую область: короткая сторона карты, а не диагональ — без «лишних» мастеров за краем
    const ne = bounds.getNorthEast();
    const radiusKm = Math.min(haversineKm({ lat: center.lat, lng: center.lng }, { lat: ne.lat, lng: center.lng }), haversineKm({ lat: center.lat, lng: center.lng }, { lat: center.lat, lng: ne.lng }));
    void setFilters({ lat: Number(center.lat.toFixed(5)), lng: Number(center.lng.toFixed(5)), radiusKm: Math.min(50, Math.max(1, Math.round(radiusKm))) });
    setAreaDirty(false);
  };

  if (!cityData || !mapStyle) {
    return (
      <div className={cn('relative overflow-hidden rounded-3xl border border-line', className)}>
        <Skeleton className="absolute inset-0 rounded-none" />
        <span className="absolute inset-0 flex items-center justify-center text-sm text-subtle">{t('loading')}</span>
      </div>
    );
  }


  return (
    <div className={cn('relative isolate overflow-hidden rounded-3xl border border-line bg-surface-2', className)}>
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: cityData.center.lng, latitude: cityData.center.lat, zoom: cityData.zoom }}
        mapStyle={mapStyle}
        style={{ width: '100%', height: '100%' }}
        onLoad={() => setLoaded(true)}
        // reuseMaps: при повторном заходе на страницу экземпляр карты берётся из кэша и load не приходит — idle приходит всегда
        onIdle={() => setLoaded(true)}
        onMoveEnd={(event) => {
          recluster();
          // Только жест пользователя: программные fitBounds/easeTo кнопку не показывают
          if ('originalEvent' in event && event.originalEvent) setAreaDirty(true);
        }}
        onClick={() => select(null)}
        attributionControl={{ compact: true }}
        dragRotate={false}
        touchPitch={false}
        reuseMaps
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <GeolocateControl position="bottom-right" />

        {geo ? (
          <Source id="search-area" type="geojson" data={circlePolygon(geo, geo.radiusKm)}>
            <Layer id="search-area-fill" type="fill" paint={{ 'fill-color': '#8b5cf6', 'fill-opacity': 0.07 }} />
            <Layer id="search-area-line" type="line" paint={{ 'line-color': '#8b5cf6', 'line-width': 1.5, 'line-dasharray': [2, 2] }} />
          </Source>
        ) : null}

        {clusters.map((cluster) => {
          if (cluster.members.length > 1) {
            const prices = cluster.members.flatMap((pin) => (pin.price !== null ? [pin.price] : []));
            return (
              <Marker key={`c-${cluster.members[0]!.id}`} longitude={cluster.lng} latitude={cluster.lat} anchor="center" style={{ zIndex: 2 }}>
                <button
                  type="button"
                  aria-label={t('cluster', { count: cluster.members.length })}
                  title={t('cluster', { count: cluster.members.length })}
                  onClick={(event) => {
                    event.stopPropagation();
                    const bounds = boundsOf(cluster.members.map((pin) => pin.location));
                    if (bounds) mapRef.current?.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 600 });
                  }}
                  className="group relative block"
                >
                  <span
                    className="flex items-center justify-center rounded-full border-2 border-white bg-brand text-[13px] font-extrabold text-white shadow-glow transition-transform duration-200 group-hover:scale-110"
                    style={{ width: 34 + Math.min(22, cluster.members.length * 1.2), height: 34 + Math.min(22, cluster.members.length * 1.2) }}
                  >
                    {cluster.members.length}
                  </span>
                  {prices.length ? (
                    <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-1.5 py-px text-[10px] font-bold text-zinc-900 shadow-float">{tc('priceFrom', { price: formatPrice(Math.min(...prices), locale) })}</span>
                  ) : null}
                </button>
              </Marker>
            );
          }
          const pin = cluster.members[0]!;
          const active = pin.id === hoveredId || pin.id === selectedId;
          return (
            <Marker
              key={pin.id}
              longitude={pin.location.lng}
              latitude={pin.location.lat}
              anchor="bottom"
              style={{ zIndex: active ? 30 : pin.promoted ? 6 : 3 }}
              onClick={(event) => {
                event.originalEvent.stopPropagation();
                select(pin.id);
                if (carousel) return;
                // Пин — ниже центра, чтобы мини-карточка над ним целиком помещалась в карту
                mapRef.current?.easeTo({ center: [pin.location.lng, pin.location.lat], offset: [0, 120], duration: 450 });
                // Список прокручивается к мастеру, его карточка подсвечивается
                document.getElementById(`master-${pin.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            >
              <button type="button" aria-label={pin.name} onMouseEnter={() => hover(pin.id)} onMouseLeave={() => hover(null)}>
                <PricePin price={pin.price} rating={pin.rating} active={active} promoted={pin.promoted} locale={locale} />
              </button>
            </Marker>
          );
        })}

        {selectedPin && !carousel ? (
          <Popup
            longitude={selectedPin.location.lng}
            latitude={selectedPin.location.lat}
            anchor="bottom"
            offset={44}
            closeButton={false}
            closeOnClick={false}
            onClose={() => select(null)}
            maxWidth="360px"
            className="mly-popup"
          >
            {popupItem ? (
              <MasterCard
                master={popupItem}
                variant="compact"
                serviceNames={serviceNames}
                hrefQuery={{ service: params.service, model: params.model }}
                className="w-[340px] shadow-float"
                mediaActions={<FavoriteButton masterId={popupItem.id} />}
              />
            ) : (
              <div className="w-[340px]">
                <MasterCardSkeleton variant="compact" />
              </div>
            )}
          </Popup>
        ) : null}
      </MapGL>

      {/* Верхняя панель: число мастеров на карте, поиск в области, большая карта */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2">
        <span className="glass pointer-events-auto rounded-full border border-line px-3 py-1.5 text-xs font-semibold shadow-float">{tc('masters', { count: pins.length })}</span>
        <div className="pointer-events-auto flex gap-2">
          {geo && !areaDirty ? (
            <Button variant="secondary" size="sm" className="rounded-full shadow-float" onClick={() => void setFilters({ lat: null, lng: null, radiusKm: null })}>
              <RotateCcw />
              <span className="max-sm:sr-only">{t('resetArea')}</span>
            </Button>
          ) : null}
          {onToggleExpand ? (
            <Button variant="secondary" size="icon-sm" className="rounded-full shadow-float" onClick={onToggleExpand} aria-label={expanded ? t('collapse') : t('expand')} title={expanded ? t('collapse') : t('expand')}>
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </Button>
          ) : null}
        </div>
      </div>
      {areaDirty ? (
        <div className="absolute inset-x-0 top-14 z-10 flex justify-center">
          <Button size="sm" className="rounded-full shadow-glow animate-rise" onClick={searchHere}>
            <Search />
            {t('searchHere')}
          </Button>
        </div>
      ) : null}

      {carousel ? (
        <div className="absolute inset-x-0 bottom-3 z-10 flex flex-col gap-2">
          {onShowList ? (
            <div className="flex justify-center">
              <Button variant="secondary" size="sm" className="rounded-full shadow-float" onClick={onShowList}>
                <List />
                {t('showList')}
              </Button>
            </div>
          ) : null}
          {items.length ? (
            <div ref={rail} onScroll={onRailScroll} className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {items.map((item) => (
                <div key={item.id} data-rail-id={item.id} className="w-[86%] max-w-sm shrink-0 snap-center">
                  <MasterCard
                    master={item}
                    variant="compact"
                    serviceNames={serviceNames}
                    hrefQuery={{ service: params.service, model: params.model }}
                    mediaActions={<FavoriteButton masterId={item.id} />}
                    className={cn('shadow-float', item.id === selectedId && 'border-accent/60')}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
