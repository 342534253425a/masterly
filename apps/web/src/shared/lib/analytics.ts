type Prop = string | number | boolean | null;

interface TrackedEvent {
  name: string;
  props: Record<string, Prop>;
  ts: number;
}

const CONSENT_KEY = 'mly-consent-analytics';
const queue: TrackedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function setAnalyticsConsent(granted: boolean) {
  try {
    localStorage.setItem(CONSENT_KEY, String(granted));
  } catch {
    // приватный режим — просто не сохраняем
  }
  if (!granted) queue.length = 0;
}

function hasConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) !== 'false';
  } catch {
    return false;
  }
}

function flush() {
  timer = null;
  if (queue.length === 0) return;
  const body = JSON.stringify({ events: queue.splice(0, 50) });
  const blob = new Blob([body], { type: 'application/json' });
  if (!navigator.sendBeacon?.('/api/v1/events', blob)) {
    void fetch('/api/v1/events', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
  }
}

/**
 * Продуктовая аналитика без скрытого трекинга: только с согласия пользователя,
 * без сторонних скриптов, батчами через sendBeacon → API → Kafka → ClickHouse.
 */
export function track(name: string, props: Record<string, Prop> = {}) {
  if (typeof window === 'undefined' || !hasConsent()) return;
  queue.push({ name, props, ts: Date.now() });
  if (queue.length >= 20) flush();
  else timer ??= setTimeout(flush, 3000);
}

if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
