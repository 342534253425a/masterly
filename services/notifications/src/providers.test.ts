import { createECDH, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createLogger, loadMigrations } from '@masterly/platform';
import { createTestDb } from '@masterly/platform/testing';
import type { Transporter } from 'nodemailer';
import { describe, expect, it } from 'vitest';
import webpush from 'web-push';
import { HttpSmsProvider, ProviderSender, SmtpProvider, WebPushProvider, type Contact } from './providers.js';

const logger = createLogger({ service: 'notifications-test', level: 'silent' });
const draft = { recipient: 'user:u-1', kind: 'lead_response', title: 'Мастер ответил на заявку', body: 'Цена от 4 500 ₽, срок 60 мин', href: '/orders/l-1' };
const contact: Contact = { userId: 'b3c2a1d0-0000-7000-8000-000000000001', email: 'alina@example.com', phone: '+79161234567' };

/** Подписка браузера: настоящие ключи P-256 и auth — web-push шифрует полезную нагрузку по RFC 8291. */
function browserSubscription(endpoint: string) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { endpoint, p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };
}

describe('провайдеры уведомлений', () => {
  it('письмо: тема, текст со ссылкой на сайт и на настройки; без email — пропуск', async () => {
    const mails: Array<Record<string, unknown>> = [];
    const transport = { sendMail: async (mail: Record<string, unknown>) => void mails.push(mail) } as unknown as Transporter;
    const email = new SmtpProvider(transport, 'Masterly <no-reply@masterly.ru>', 'https://masterly.ru');
    await email.send(contact, draft);
    await email.send({ ...contact, email: '' }, draft);
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: 'alina@example.com', subject: 'Мастер ответил на заявку' });
    expect(mails[0]!.text).toContain('https://masterly.ru/orders/l-1');
    expect(mails[0]!.html).toContain('href="https://masterly.ru/settings"');
  });

  it('SMS: HTTP-шлюз с токеном; ошибка шлюза — исключение (доставка повторится)', async () => {
    const received: Array<{ auth: string; body: { to: string; text: string } }> = [];
    let status = 200;
    const server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => (body += chunk.toString()));
      request.on('end', () => {
        received.push({ auth: String(request.headers.authorization), body: JSON.parse(body) as { to: string; text: string } });
        response.writeHead(status).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const sms = new HttpSmsProvider(`http://127.0.0.1:${(server.address() as AddressInfo).port}/send`, 'token-1');
    try {
      await sms.send(contact, draft);
      expect(received[0]).toEqual({ auth: 'Bearer token-1', body: { to: '+79161234567', text: 'Masterly: Мастер ответил на заявку. Цена от 4 500 ₽, срок 60 мин' } });
      status = 503;
      await expect(sms.send(contact, draft)).rejects.toThrow('503');
    } finally {
      server.close();
    }
  });

  it('Web Push: шифрование и подпись VAPID; подписки, отвергнутые браузером (410), удаляются', async () => {
    const db = await createTestDb({ migrations: await loadMigrations(fileURLToPath(new URL('../migrations', import.meta.url))) });
    const live = browserSubscription('https://fcm.googleapis.com/fcm/send/live');
    const gone = browserSubscription('https://updates.push.services.mozilla.com/wpush/v2/gone');
    for (const item of [live, gone]) await db.query('INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES ($1, $2, $3, $4)', [item.endpoint, contact.userId, item.p256dh, item.auth]);

    const vapid = { ...webpush.generateVAPIDKeys(), subject: 'mailto:support@masterly.ru' };
    const requests: Array<{ endpoint: string; headers: Record<string, string | number> }> = [];
    let transient = false;
    const push = new WebPushProvider(db, vapid, 'https://masterly.ru', async (subscription, payload, options) => {
      // Настоящая подготовка запроса web-push (ECDH + aes128gcm + JWT VAPID), без похода в сеть
      const details = webpush.generateRequestDetails(subscription, payload, options);
      requests.push({ endpoint: details.endpoint, headers: details.headers as Record<string, string | number> });
      if (transient) throw Object.assign(new Error('push-сервис недоступен'), { statusCode: 503 });
      if (subscription.endpoint === gone.endpoint) throw Object.assign(new Error('Gone'), { statusCode: 410 });
    });

    await push.send(contact, draft);
    expect(requests).toHaveLength(2);
    expect(requests[0]!.headers).toMatchObject({ 'Content-Encoding': 'aes128gcm', TTL: 86_400, Urgency: 'normal' });
    expect(String(requests[0]!.headers.Authorization)).toMatch(/^vapid t=.+, k=/);
    const { rows } = await db.query<{ endpoint: string; last_success_at: Date | null }>('SELECT endpoint, last_success_at FROM push_subscriptions');
    expect(rows).toEqual([{ endpoint: live.endpoint, last_success_at: expect.any(Date) }]);

    transient = true;
    await expect(push.send(contact, draft)).rejects.toThrow('push-сервис недоступен');
    await db.close();
  });

  it('отправитель: канал без провайдера и удалённый получатель — без ошибок и повторов', async () => {
    const delivered: string[] = [];
    const sender = new ProviderSender(
      { resolve: async (recipient) => (recipient === 'user:deleted' ? null : contact) },
      { email: { send: async (to) => void delivered.push(to.email) } },
      logger,
    );
    await sender.send('email', 'user:u-1', draft);
    await sender.send('email', 'user:deleted', draft);
    await sender.send('sms', 'user:u-1', draft);
    expect(delivered).toEqual(['alina@example.com']);
  });
});
