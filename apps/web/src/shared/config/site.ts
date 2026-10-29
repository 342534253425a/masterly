export const siteConfig = {
  name: 'Masterly',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100',
  supportEmail: 'support@masterly.dev',
  defaultCity: 'moskva',
  /** MVP-вертикаль. Новые категории включаются фичефлагом на бэкенде без изменения фронтенда. */
  activeCategory: 'smartphones',
} as const;

export const API_MODE = process.env.API_MODE ?? 'mock';
/** Живой канал чата (WebSocket messaging) — только в живом режиме. Читается на сервере и передаётся в провайдеры. */
export const REALTIME_URL = API_MODE === 'live' ? (process.env.REALTIME_URL ?? '/ws') : null;
export const CITY_COOKIE = 'mly_city';
