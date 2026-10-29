/** Цены на платформе — информационные. Онлайн-оплаты нет и не будет: клиент платит мастеру напрямую. */
export const CURRENCY = 'RUB' as const;

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(locale: string): Intl.NumberFormat {
  let instance = formatters.get(locale);
  if (!instance) {
    instance = new Intl.NumberFormat(locale, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 });
    formatters.set(locale, instance);
  }
  return instance;
}

export function formatRub(amount: number, locale = 'ru-RU'): string {
  return formatter(locale).format(amount);
}

/** Округление до «красивой» цены, как это делают мастерские. */
export function roundPrice(amount: number, step = 100): number {
  return Math.max(0, Math.round(amount / step) * step);
}

/** Минорные единицы (копейки) — так цены хранятся в БД и передаются по gRPC. */
export const toMinor = (rub: number): number => Math.round(rub * 100);
export const fromMinor = (kopecks: number): number => Math.round(kopecks) / 100;
