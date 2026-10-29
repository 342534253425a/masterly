const intlLocale = (locale: string) => (locale === 'ru' ? 'ru-RU' : locale === 'zh' ? 'zh-CN' : 'en-US');

const cache = new Map<string, Intl.NumberFormat>();
function numberFormat(locale: string, options: Intl.NumberFormatOptions) {
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = cache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(intlLocale(locale), options);
    cache.set(key, formatter);
  }
  return formatter;
}

/** Цены показываем в рублях — валюта платформы, независимо от языка интерфейса. */
export const formatPrice = (amount: number, locale = 'ru') =>
  numberFormat(locale, { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(amount);

export const formatNumber = (value: number, locale = 'ru') => numberFormat(locale, { maximumFractionDigits: 1 }).format(value);

export const formatCompact = (value: number, locale = 'ru') =>
  numberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export const formatPercent = (value: number, locale = 'ru', digits = 1) =>
  numberFormat(locale, { style: 'percent', maximumFractionDigits: digits }).format(value);

export function formatDistance(km: number, locale = 'ru') {
  return km < 1
    ? numberFormat(locale, { style: 'unit', unit: 'meter', maximumFractionDigits: 0 }).format(Math.round((km * 1000) / 10) * 10)
    : numberFormat(locale, { style: 'unit', unit: 'kilometer', maximumFractionDigits: 1 }).format(km);
}

export function formatDuration(minutes: number, locale = 'ru') {
  if (minutes < 60) return numberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'short' }).format(minutes);
  return numberFormat(locale, { style: 'unit', unit: 'hour', unitDisplay: 'short', maximumFractionDigits: 1 }).format(minutes / 60);
}

const relative = new Map<string, Intl.RelativeTimeFormat>();

export function formatRelative(date: string | Date, locale = 'ru', now = Date.now()) {
  let formatter = relative.get(locale);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });
    relative.set(locale, formatter);
  }
  const seconds = Math.round((new Date(date).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return formatter.format(Math.round(seconds), 'second');
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return formatter.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86_400 * 30) return formatter.format(Math.round(seconds / 86_400), 'day');
  if (abs < 86_400 * 365) return formatter.format(Math.round(seconds / (86_400 * 30)), 'month');
  return formatter.format(Math.round(seconds / (86_400 * 365)), 'year');
}

export const formatDate = (date: string | Date, locale = 'ru', options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) =>
  new Intl.DateTimeFormat(intlLocale(locale), { timeZone: 'Europe/Moscow', ...options }).format(new Date(date));

export const formatTime = (date: string | Date, locale = 'ru') =>
  new Intl.DateTimeFormat(intlLocale(locale), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(new Date(date));
