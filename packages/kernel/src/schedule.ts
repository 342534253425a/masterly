/** Часы работы по дням недели, индекс 0 = понедельник. null — выходной. */
export type WeeklySchedule = ReadonlyArray<{ open: string; close: string } | null>;

export interface LocalClock {
  weekday: number; // 0 = понедельник
  minutes: number; // минуты от полуночи
}

const WEEKDAYS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

export function localClock(date: Date, timeZone: string): LocalClock {
  let formatter = clockFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    clockFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return { weekday: WEEKDAYS[get('weekday')] ?? 0, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

export const toMinutes = (hhmm: string): number => {
  const [h = '0', m = '0'] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
};

export type OpenState =
  | { open: true; closesAt: string }
  | { open: false; opensAt: string; inDays: number }
  | { open: false; opensAt: null; inDays: null };

export function openState(schedule: WeeklySchedule, timeZone: string, date = new Date()): OpenState {
  const { weekday, minutes } = localClock(date, timeZone);
  const today = schedule[weekday];
  if (today && minutes >= toMinutes(today.open) && minutes < toMinutes(today.close)) {
    return { open: true, closesAt: today.close };
  }
  if (today && minutes < toMinutes(today.open)) return { open: false, opensAt: today.open, inDays: 0 };
  for (let offset = 1; offset <= 7; offset++) {
    const day = schedule[(weekday + offset) % 7];
    if (day) return { open: false, opensAt: day.open, inDays: offset };
  }
  return { open: false, opensAt: null, inDays: null };
}

export interface QuietHours {
  start: string; // «22:00»
  end: string; // «08:00»
}

/** Тихие часы могут переходить через полночь (22:00–08:00). */
export function isInQuietHours(quiet: QuietHours, timeZone: string, date = new Date()): boolean {
  const { minutes } = localClock(date, timeZone);
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/** Сколько миллисекунд отложить уведомление, чтобы не разбудить пользователя. */
export function quietHoursDelayMs(quiet: QuietHours, timeZone: string, date = new Date()): number {
  if (!isInQuietHours(quiet, timeZone, date)) return 0;
  const { minutes } = localClock(date, timeZone);
  const end = toMinutes(quiet.end);
  const diff = end > minutes ? end - minutes : 24 * 60 - minutes + end;
  return diff * 60_000 - date.getSeconds() * 1000;
}
