import { createLogger, MemoryPubSub, type AccessClaims } from '@masterly/platform';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { ChatNotifier, RealtimeServer } from './realtime.js';

const logger = createLogger({ service: 'messaging-test', level: 'silent' });
const ORIGIN = 'https://masterly.test';

/** Проверка токена подменена: в сквозном тесте шлюза то же самое делается настоящими JWT identity. */
const TOKENS: Record<string, Omit<AccessClaims, 'expiresAt'> & { ttlMs: number }> = {
  client: { userId: 'u-client', roles: ['client'], masterId: '', name: 'Клиент', cityId: 'msk', ttlMs: 60_000 },
  master: { userId: 'u-master', roles: ['client', 'master'], masterId: 'm-1', name: 'Мастер', cityId: 'msk', ttlMs: 60_000 },
  short: { userId: 'u-short', roles: ['client'], masterId: '', name: 'Клиент', cityId: 'msk', ttlMs: 300 },
  busy: { userId: 'u-busy', roles: ['client'], masterId: '', name: 'Клиент', cityId: 'msk', ttlMs: 60_000 },
};

describe('живой канал чата (WebSocket)', () => {
  const pubsub = new MemoryPubSub();
  const notifier = new ChatNotifier(pubsub, logger);
  const sockets: WebSocket[] = [];
  let server: RealtimeServer;
  let url: string;

  beforeAll(async () => {
    server = new RealtimeServer({
      port: 0,
      path: '/ws',
      allowedOrigins: [ORIGIN],
      verify: async (token) => {
        const entry = TOKENS[token];
        return entry ? { ...entry, expiresAt: Date.now() + entry.ttlMs } : null;
      },
      pubsub,
      logger,
      maxConnectionsPerUser: 2,
    });
    url = `ws://127.0.0.1:${await server.start()}`;
  });

  afterAll(async () => {
    for (const socket of sockets) socket.terminate();
    await server.close();
  });

  /** Подключение: либо готовый сокет с очередью сообщений, либо HTTP-статус отказа. */
  function connect(token: string | null, options: { origin?: string; path?: string } = {}) {
    const ws = new WebSocket(`${url}${options.path ?? '/ws'}`, { headers: { origin: options.origin ?? ORIGIN, ...(token ? { cookie: `theme=dark; mly_at=${token}` } : {}) } });
    sockets.push(ws);
    ws.on('error', () => undefined); // отказ рукопожатия приходит и событием error — он проверяется по статусу
    const messages: Array<Record<string, unknown>> = [];
    const waiters: Array<() => void> = [];
    ws.on('message', (data) => {
      messages.push(JSON.parse(String(data)) as Record<string, unknown>);
      waiters.splice(0).forEach((wake) => wake());
    });
    const next = async (count: number) => {
      while (messages.length < count) await new Promise<void>((resolve) => waiters.push(resolve));
      return messages[count - 1]!;
    };
    const opened = new Promise<{ status: number }>((resolve) => {
      ws.once('open', () => resolve({ status: 101 }));
      ws.once('unexpected-response', (_request, response) => resolve({ status: response.statusCode ?? 0 }));
    });
    const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
    return { ws, opened, closed, next };
  }

  it('отказ без токена, с чужого сайта и не по адресу канала', async () => {
    expect((await connect(null).opened).status).toBe(401);
    expect((await connect('client', { origin: 'https://evil.example' }).opened).status).toBe(403);
    expect((await connect('client', { path: '/other' }).opened).status).toBe(404);
    expect((await connect('unknown-token').opened).status).toBe(401);
  });

  it('сигнал о сообщении доходит до обеих сторон диалога, но не до посторонних', async () => {
    const client = connect('client');
    const master = connect('master');
    const stranger = connect('busy');
    for (const socket of [client, master, stranger]) {
      expect((await socket.opened).status).toBe(101);
      expect(await socket.next(1)).toEqual({ type: 'ready' });
    }

    await notifier.notify([{ conversationId: 'c-1', clientId: 'u-client', masterId: 'm-1', messageId: 'msg-1', kind: 'text' }]);
    const signal = { type: 'message', conversationId: 'c-1', messageId: 'msg-1', kind: 'text' };
    expect(await client.next(2)).toEqual(signal);
    expect(await master.next(2)).toEqual(signal);

    await notifier.notify([{ conversationId: 'c-2', clientId: 'u-other', masterId: 'm-2', messageId: 'msg-2', kind: 'system' }]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stranger.ws.readyState).toBe(WebSocket.OPEN);
    await expect(Promise.race([stranger.next(2), new Promise((resolve) => setTimeout(() => resolve('тишина'), 50))])).resolves.toBe('тишина');
  });

  it('лимит соединений на пользователя; входящие сообщения клиента закрывают канал', async () => {
    const extra = connect('busy');
    expect((await extra.opened).status).toBe(101);
    expect((await connect('busy').opened).status).toBe(429);

    extra.ws.send('привет');
    expect(await extra.closed).toBe(1003);
    // После закрытия место освобождается
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await connect('busy').opened).status).toBe(101);
  });

  it('к истечению access-токена соединение закрывается кодом 4001 — клиент обновит сессию и переподключится', async () => {
    const short = connect('short');
    expect((await short.opened).status).toBe(101);
    expect(await short.closed).toBe(4001);
  });
});
