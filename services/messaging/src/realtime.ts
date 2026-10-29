import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { ACCESS_COOKIE, metrics, parseCookies, type AccessClaims, type Logger, type PubSub } from '@masterly/platform';
import { WebSocket, WebSocketServer } from 'ws';

/** Сигнал вкладкам «в диалоге новое сообщение»: данные клиент забирает через шлюз — там права доступа и форма ответа. */
export interface ChatSignal {
  type: 'message';
  conversationId: string;
  messageId: string;
  kind: 'text' | 'system';
}

export interface ChatDelivery {
  conversationId: string;
  clientId: string;
  masterId: string;
  messageId: string;
  kind: string;
}

/** Канал пользователя (клиентская сторона диалога) и канал мастерской (все аккаунты, которые ей управляют). */
export const userChannel = (userId: string) => `chat:user:${userId}`;
export const masterChannel = (masterId: string) => `chat:master:${masterId}`;

/** Публикация после коммита: обе стороны диалога, включая другие вкладки и устройства автора. */
export class ChatNotifier {
  constructor(
    private readonly pubsub: PubSub | undefined,
    private readonly logger: Logger,
  ) {}

  async notify(deliveries: ChatDelivery[]): Promise<void> {
    if (!this.pubsub || deliveries.length === 0) return;
    const pubsub = this.pubsub;
    const published = deliveries.flatMap((delivery) => {
      const signal = JSON.stringify({ type: 'message', conversationId: delivery.conversationId, messageId: delivery.messageId, kind: delivery.kind === 'system' ? 'system' : 'text' } satisfies ChatSignal);
      return [userChannel(delivery.clientId), masterChannel(delivery.masterId)].map((channel) => pubsub.publish(channel, signal));
    });
    // Без Redis сообщение не теряется: оно в БД, а клиенты без сигнала дочитают его опросом
    for (const result of await Promise.allSettled(published)) {
      if (result.status === 'rejected') this.logger.warn({ err: result.reason }, 'сигнал чата не опубликован');
    }
  }
}

export interface RealtimeOptions {
  port: number;
  path: string;
  /** Разрешённые Origin браузерных подключений (защита от Cross-Site WebSocket Hijacking). */
  allowedOrigins: string[];
  verify(token: string): Promise<AccessClaims | null>;
  pubsub: PubSub;
  logger: Logger;
  maxConnectionsPerUser?: number;
  heartbeatMs?: number;
}

const MAX_BUFFERED_BYTES = 1 << 20;

/**
 * WebSocket только «сервер → клиент»: вход по access-cookie (или Bearer для мобильных клиентов), подписка на каналы
 * пользователя и мастерской. Соединение закрывается к истечению токена (код 4001) — клиент обновит сессию и переподключится.
 */
export class RealtimeServer {
  private readonly http: Server;
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024, perMessageDeflate: false });
  private readonly perUser = new Map<string, number>();
  private readonly alive = new WeakMap<WebSocket, boolean>();
  private heartbeat?: NodeJS.Timeout;

  constructor(private readonly options: RealtimeOptions) {
    this.http = createServer((_request, response) => response.writeHead(426, { 'content-type': 'text/plain; charset=utf-8' }).end('Нужен WebSocket'));
    this.http.on('upgrade', (request, socket, head) => void this.upgrade(request, socket, head));
  }

  async start(): Promise<number> {
    await new Promise<void>((resolve) => this.http.listen(this.options.port, resolve));
    this.heartbeat = setInterval(() => this.sweep(), this.options.heartbeatMs ?? 30_000);
    this.heartbeat.unref();
    const { port } = this.http.address() as AddressInfo;
    this.options.logger.info({ port, path: this.options.path }, 'WebSocket чата запущен');
    return port;
  }

  /** Остановка пода: клиенты получают 1012 (service restart) и переподключаются к другим подам. */
  async close(): Promise<void> {
    clearInterval(this.heartbeat);
    for (const socket of this.wss.clients) socket.close(1012, 'restart');
    await new Promise<void>((resolve) => this.http.close(() => resolve()));
  }

  private reject(socket: Duplex, status: number, reason: string): void {
    metrics.wsRejected.inc({ reason });
    socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }

  private async upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    socket.on('error', () => socket.destroy());
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    if (pathname !== this.options.path) return this.reject(socket, 404, 'not_found');
    // Браузер всегда присылает Origin: чужой сайт не должен подключаться с cookie пользователя
    const origin = request.headers.origin;
    if (origin && !this.options.allowedOrigins.includes(origin)) return this.reject(socket, 403, 'origin');

    const bearer = /^Bearer (.+)$/i.exec(request.headers.authorization ?? '')?.[1];
    const token = bearer ?? parseCookies(request.headers.cookie)[ACCESS_COOKIE];
    const claims = token ? await this.options.verify(token).catch(() => null) : null;
    if (!claims || claims.expiresAt <= Date.now()) return this.reject(socket, 401, 'unauthenticated');
    if ((this.perUser.get(claims.userId) ?? 0) >= (this.options.maxConnectionsPerUser ?? 8)) return this.reject(socket, 429, 'too_many_connections');
    this.wss.handleUpgrade(request, socket, head, (ws) => this.accept(ws, claims));
  }

  private accept(ws: WebSocket, claims: AccessClaims): void {
    metrics.wsConnections.inc();
    this.perUser.set(claims.userId, (this.perUser.get(claims.userId) ?? 0) + 1);
    this.alive.set(ws, true);
    const send = (message: string) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      // Медленный клиент не должен копить память пода: закрываем, он переподключится и дочитает данные запросом
      if (ws.bufferedAmount > MAX_BUFFERED_BYTES) return ws.terminate();
      ws.send(message);
      metrics.wsSignals.inc({ type: 'message' });
    };
    const channels = [userChannel(claims.userId), ...(claims.masterId ? [masterChannel(claims.masterId)] : [])];
    const subscriptions = Promise.all(channels.map((channel) => this.options.pubsub.subscribe(channel, send)));
    const expiry = setTimeout(() => ws.close(4001, 'token_expired'), Math.min(claims.expiresAt - Date.now(), 2 ** 31 - 1));

    ws.on('pong', () => this.alive.set(ws, true));
    ws.on('error', () => ws.terminate());
    // Канал односторонний: входящие сообщения клиента не нужны
    ws.on('message', () => ws.close(1003, 'unsupported'));
    ws.once('close', () => {
      clearTimeout(expiry);
      metrics.wsConnections.dec();
      const left = (this.perUser.get(claims.userId) ?? 1) - 1;
      if (left > 0) this.perUser.set(claims.userId, left);
      else this.perUser.delete(claims.userId);
      void subscriptions.then((unsubscribe) => Promise.all(unsubscribe.map((stop) => stop()))).catch(() => undefined);
    });
    void subscriptions
      .then(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'ready' })))
      .catch((error: unknown) => {
        this.options.logger.warn({ err: error }, 'подписка на каналы чата не удалась');
        ws.close(1011, 'unavailable');
      });
  }

  /** Сердцебиение: соединения, не ответившие на ping за интервал, закрываются (обрыв мобильной сети, спящий ноутбук). */
  private sweep(): void {
    for (const ws of this.wss.clients) {
      if (!this.alive.get(ws)) {
        ws.terminate();
        continue;
      }
      this.alive.set(ws, false);
      ws.ping();
    }
  }
}
