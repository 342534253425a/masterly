/** Сигнал живого канала: «в диалоге новое сообщение». Данные забираются обычным запросом через шлюз. */
export interface RealtimeSignal {
  type: 'message';
  conversationId: string;
  messageId: string;
  kind: 'text' | 'system';
}

export interface RealtimeHandlers {
  onSignal(signal: RealtimeSignal): void;
  /** Канал (пере)подключён: всё, что пришло за время разрыва, нужно дочитать. */
  onReady(): void;
  /** Access-токен истёк (код 4001): тихо обновить сессию по refresh-cookie до переподключения. */
  onExpired(): Promise<unknown>;
}

let connected = false;
const statusListeners = new Set<() => void>();

/** Пока канал жив, опрос API редкий (страховка); без канала — частый, как в демо-режиме. */
export const isRealtimeConnected = () => connected;

export function subscribeRealtimeStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function setConnected(value: boolean): void {
  if (connected === value) return;
  connected = value;
  statusListeners.forEach((listener) => listener());
}

/** '/ws' → wss://текущий-хост/ws: в проде ingress направляет этот путь на поды messaging. */
function absolute(url: string): string {
  if (/^wss?:\/\//.test(url)) return url;
  const base = new URL(url, window.location.href);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  return base.toString();
}

/**
 * Подключение к живому каналу чата с переподключением: экспоненциальная задержка с джиттером (до 30 с),
 * сброс после «ready». Возвращает отключение (выход из аккаунта, размонтирование).
 */
export function connectRealtime(url: string, handlers: RealtimeHandlers): () => void {
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let stopped = false;

  const open = () => {
    if (stopped) return;
    const current = new WebSocket(absolute(url));
    socket = current;
    current.onmessage = (event: MessageEvent<string>) => {
      let data: { type?: string; conversationId?: string };
      try {
        data = JSON.parse(event.data) as typeof data;
      } catch {
        return;
      }
      if (data.type === 'ready') {
        attempt = 0;
        setConnected(true);
        handlers.onReady();
      } else if (data.type === 'message' && data.conversationId) {
        handlers.onSignal(data as RealtimeSignal);
      }
    };
    current.onclose = (event: CloseEvent) => {
      if (socket === current) socket = null;
      setConnected(false);
      if (stopped) return;
      if (event.code === 4001) {
        // Токен истёк по расписанию: обновляем сессию и подключаемся сразу, без задержки
        void handlers.onExpired().catch(() => undefined).finally(open);
        return;
      }
      // 1012 — под перезапускается (выкатка): разносим переподключения на 0–5 с, чтобы не прийти толпой на соседние поды
      const delay = event.code === 1012 ? Math.random() * 5_000 : Math.min(30_000, 1_000 * 2 ** attempt) * (0.5 + Math.random());
      attempt++;
      timer = setTimeout(open, delay);
    };
  };

  open();
  return () => {
    stopped = true;
    clearTimeout(timer);
    socket?.close(1000);
    socket = null;
    setConnected(false);
  };
}
