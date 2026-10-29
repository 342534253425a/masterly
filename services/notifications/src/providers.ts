import { createGrpcClient, grpcAddress, type Db, type Logger } from '@masterly/platform';
import type { catalog, identity } from '@masterly/proto';
import nodemailer, { type Transporter } from 'nodemailer';
import webpush from 'web-push';
import type { Channel, ChannelSender, Draft } from './notifications.service.js';

/** Куда доставлять: адреса берутся у владельцев данных в момент отправки (ПДн не копируются в notifications). */
export interface Contact {
  userId: string;
  email: string;
  phone: string;
}

export interface RecipientDirectory {
  /** null — получателя больше нет (аккаунт удалён): доставка пропускается без повторов. */
  resolve(recipient: string): Promise<Contact | null>;
}

/** Канал доставки. Нет адреса у получателя — тихий пропуск; ошибка провайдера — исключение (повтор с отсрочкой). */
export interface Provider {
  send(contact: Contact, draft: Draft): Promise<void>;
}

const isNotFound = (error: unknown) => (error as { code?: string }).code === 'NOT_FOUND';

/** user:<id> → контакты identity; master:<id> → владелец мастерской из catalog (телефон мастерской — запасной для SMS). */
export function grpcDirectory(addresses: { identity: string; catalog: string }): RecipientDirectory & { close(): void } {
  const identityClient = createGrpcClient<identity.IdentityServiceClient>({
    target: 'identity', address: grpcAddress(addresses.identity), protoPath: 'masterly/identity/v1/identity.proto', package: 'masterly.identity.v1', service: 'IdentityService', idempotentMethods: ['getUserContacts'],
  });
  const catalogClient = createGrpcClient<catalog.CatalogServiceClient>({
    target: 'catalog', address: grpcAddress(addresses.catalog), protoPath: 'masterly/catalog/v1/catalog.proto', package: 'masterly.catalog.v1', service: 'CatalogService', idempotentMethods: ['getMasterContacts'],
  });
  const user = async (userId: string): Promise<Contact | null> => {
    try {
      const contacts = await identityClient.getUserContacts({ userId });
      return { userId, email: contacts.email, phone: contacts.phone };
    } catch (error) {
      if (isNotFound(error) || (error as { code?: string }).code === 'UNAUTHENTICATED') return null;
      throw error;
    }
  };
  return {
    async resolve(recipient) {
      const [kind, id = ''] = recipient.split(':');
      if (kind === 'user') return user(id);
      if (kind !== 'master') return null;
      let master: catalog.GetMasterContactsResponse;
      try {
        master = await catalogClient.getMasterContacts({ masterId: id });
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
      const owner = master.ownerUserId ? await user(master.ownerUserId) : null;
      return owner ? { ...owner, phone: owner.phone || master.phone } : master.phone ? { userId: '', email: '', phone: master.phone } : null;
    },
    close() {
      identityClient.close();
      catalogClient.close();
    },
  };
}

const link = (publicUrl: string, href: string) => (href ? new URL(href, publicUrl).toString() : publicUrl);
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** Письмо: SMTP (в проде — Yandex Cloud Postbox, локально — Mailpit). */
export class SmtpProvider implements Provider {
  private readonly transport: Transporter;

  constructor(
    transport: string | Transporter,
    private readonly from: string,
    private readonly publicUrl: string,
  ) {
    this.transport = typeof transport === 'string' ? nodemailer.createTransport(transport) : transport;
  }

  async send(contact: Contact, draft: Draft): Promise<void> {
    if (!contact.email) return;
    const url = link(this.publicUrl, draft.href);
    await this.transport.sendMail({
      from: this.from,
      to: contact.email,
      subject: draft.title,
      text: `${draft.body}\n\n${url}\n\nНастроить уведомления: ${link(this.publicUrl, '/settings')}`,
      html: `<p>${escapeHtml(draft.body)}</p><p><a href="${escapeHtml(url)}">Открыть в Masterly</a></p><p style="color:#888;font-size:12px">Настроить уведомления можно в <a href="${escapeHtml(link(this.publicUrl, '/settings'))}">настройках</a>.</p>`,
      headers: { 'X-Masterly-Kind': draft.kind },
    });
  }
}

/** SMS через HTTP-шлюз оператора — тот же контракт, что у кодов входа в identity: POST { to, text }. */
export class HttpSmsProvider implements Provider {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async send(contact: Contact, draft: Draft): Promise<void> {
    if (!contact.phone) return;
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ to: contact.phone, text: `Masterly: ${draft.title}. ${draft.body}`.slice(0, 300) }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new Error(`SMS-шлюз ответил ${response.status}`);
  }
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  /** mailto: или https: — контакт для push-сервисов браузеров. */
  subject: string;
}

type PushSend = (subscription: webpush.PushSubscription, payload: string, options: webpush.RequestOptions) => Promise<unknown>;

/**
 * Web Push (RFC 8030/8291, VAPID): шифрованная полезная нагрузка уходит в push-сервис браузера по каждой подписке пользователя.
 * Подписки, на которые сервис ответил 404/410, удаляются: браузер отписался или сменил ключи.
 */
export class WebPushProvider implements Provider {
  constructor(
    private readonly db: Db,
    private readonly vapid: VapidKeys,
    private readonly publicUrl: string,
    private readonly push: PushSend = (subscription, payload, options) => webpush.sendNotification(subscription, payload, options),
  ) {}

  async send(contact: Contact, draft: Draft): Promise<void> {
    if (!contact.userId) return;
    const { rows } = await this.db.query<{ endpoint: string; p256dh: string; auth: string }>('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1', [contact.userId]);
    const payload = JSON.stringify({ title: draft.title, body: draft.body, href: link(this.publicUrl, draft.href), tag: draft.kind });
    let failure: unknown;
    for (const row of rows) {
      try {
        await this.push({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, {
          TTL: 24 * 3600,
          urgency: draft.kind === 'message' || draft.kind === 'lead_new' ? 'high' : 'normal',
          vapidDetails: this.vapid,
          timeout: 5_000,
        });
        await this.db.query('UPDATE push_subscriptions SET last_success_at = now() WHERE endpoint = $1', [row.endpoint]);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await this.db.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]);
        else failure = error;
      }
    }
    // Повтор всей доставки — только если не дошло ни до одного устройства из-за временной ошибки
    if (failure && rows.length > 0) throw failure;
  }
}

/** Отправитель доставок: канал → провайдер. Канал без провайдера пишется в лог (разработка) и не повторяется. */
export class ProviderSender implements ChannelSender {
  constructor(
    private readonly directory: RecipientDirectory,
    private readonly providers: Partial<Record<Exclude<Channel, 'in_app'>, Provider>>,
    private readonly logger: Logger,
  ) {}

  async send(channel: Exclude<Channel, 'in_app'>, recipient: string, draft: Draft): Promise<void> {
    const provider = this.providers[channel];
    if (!provider) {
      this.logger.info({ channel, recipient, kind: draft.kind }, 'канал не настроен — уведомление только в ленте');
      return;
    }
    const contact = await this.directory.resolve(recipient);
    if (contact) await provider.send(contact, draft);
  }
}
