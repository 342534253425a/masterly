import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import ru from './messages/ru.json';
import { routing } from './routing';

type Messages = Record<string, unknown>;

/** Переводы en/zh неполные: недостающие ключи берутся из русского словаря. */
function mergeMessages(base: Messages, override: Messages): Messages {
  const result: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] =
      value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object' && !Array.isArray(current)
        ? mergeMessages(current as Messages, value as Messages)
        : value;
  }
  return result;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const messages =
    locale === 'ru' ? ru : (mergeMessages(ru, (await import(`./messages/${locale}.json`)).default as Messages) as typeof ru);
  return { locale, messages, timeZone: 'Europe/Moscow' };
});
