import { defineRouting } from 'next-intl/routing';

/** Русский — основной язык (без префикса в URL), английский и китайский — в перспективе (beta). */
export const routing = defineRouting({
  locales: ['ru', 'en', 'zh'],
  defaultLocale: 'ru',
  localePrefix: 'as-needed',
  // Переводы en/zh неполные: язык браузера не выбирает локаль, иначе интерфейс выходит вперемешку («Ответ ~11 min»).
  // Другой язык — только явно, переключателем (запоминается в cookie)
  localeDetection: false,
  localeCookie: { name: 'MLY_LOCALE', maxAge: 60 * 60 * 24 * 365 },
});

export type Locale = (typeof routing.locales)[number];
