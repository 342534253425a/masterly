'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CITY_COOKIE, siteConfig } from '@/shared/config';

interface CityContextValue {
  slug: string;
  setCity: (slug: string) => void;
}

const CityContext = createContext<CityContextValue>({ slug: siteConfig.defaultCity, setCity: () => {} });

/** Город хранится в cookie — сервер рендерит выдачу сразу для нужного города (SSR без «прыжка»). */
export function CityProvider({ initialCity, children }: { initialCity: string; children: ReactNode }) {
  const [slug, setSlug] = useState(initialCity);
  const setCity = useCallback((next: string) => {
    setSlug(next);
    document.cookie = `${CITY_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, []);
  const value = useMemo(() => ({ slug, setCity }), [slug, setCity]);
  return <CityContext.Provider value={value}>{children}</CityContext.Provider>;
}

export const useCurrentCity = () => useContext(CityContext);
