import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { registry } from './metrics.js';

export interface HealthServer {
  readonly port: number;
  setReady(ready: boolean): void;
  close(): Promise<void>;
}

/**
 * /health/live — процесс жив (цикл событий отвечает);
 * /health/ready — готов принимать трафик. Общие зависимости (БД, Kafka) сюда сознательно не входят:
 * их отказ у всех подов сразу снял бы весь сервис с балансировки (docs/architecture/resilience.md#9).
 */
export async function startHealthServer(port: number): Promise<HealthServer> {
  let ready = false;
  const send = (res: ServerResponse, code: number, body: string) => {
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(body);
  };

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/health/live') return send(res, 200, 'ok');
    if (url === '/health/ready') return send(res, ready ? 200 : 503, ready ? 'ready' : 'not ready');
    if (url === '/metrics') {
      registry
        .metrics()
        .then((body) => {
          res.writeHead(200, { 'Content-Type': registry.contentType });
          res.end(body);
        })
        .catch(() => send(res, 500, 'metrics error'));
      return;
    }
    send(res, 404, 'not found');
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  return {
    port: (server.address() as AddressInfo).port,
    setReady: (value) => {
      ready = value;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
