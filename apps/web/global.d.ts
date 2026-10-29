import type messages from './src/shared/i18n/messages/ru.json';
import type { routing } from './src/shared/i18n/routing';

/** Типобезопасные ключи переводов: опечатка в t('…') — ошибка компиляции. */
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
