'use client';

import type { StyleSpecification } from 'maplibre-gl';
import { useEffect, useState } from 'react';

/** Векторные стили OpenFreeMap (OpenMapTiles, без ключа). У CARTO подписи только латиницей (Reutov, Lyubertsy). */
const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;
const FALLBACK = {
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
} as const;

/** Русские названия: name:ru из OpenStreetMap, иначе местное название (в городах РФ оно тоже русское). */
const RUSSIAN_LABEL = ['coalesce', ['get', 'name:ru'], ['get', 'name']];

const cache = new Map<string, Promise<StyleSpecification>>();

export function russianStyle(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      const field = layer.type === 'symbol' ? layer.layout?.['text-field'] : undefined;
      // Номера дорог (ref) и прочие поля не трогаем — только выражения с названиями
      if (layer.type !== 'symbol' || !field || !JSON.stringify(field).includes('name')) return layer;
      return { ...layer, layout: { ...layer.layout, 'text-field': RUSSIAN_LABEL as never } };
    }),
  };
}

function load(theme: keyof typeof STYLES): Promise<StyleSpecification> {
  let style = cache.get(theme);
  if (!style) {
    style = fetch(STYLES[theme])
      .then((response) => {
        if (!response.ok) throw new Error(`style ${response.status}`);
        return response.json() as Promise<StyleSpecification>;
      })
      .then(russianStyle);
    style.catch(() => cache.delete(theme));
    cache.set(theme, style);
  }
  return style;
}

/** Стиль карты под тему; при недоступности OpenFreeMap — CARTO (подписи латиницей, но карта работает). */
export function useRussianMapStyle(theme: 'light' | 'dark'): StyleSpecification | string | null {
  const [style, setStyle] = useState<StyleSpecification | string | null>(null);
  useEffect(() => {
    let alive = true;
    load(theme)
      .then((loaded) => alive && setStyle(loaded))
      .catch(() => alive && setStyle(FALLBACK[theme]));
    return () => {
      alive = false;
    };
  }, [theme]);
  return style;
}
