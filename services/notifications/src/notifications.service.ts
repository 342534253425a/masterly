import { Inject, Injectable } from '@nestjs/common';
import { serviceById } from '@masterly/fixtures';
import { quietHoursDelayMs, uuidv7 } from '@masterly/kernel';
import { DB, invalid, unauthenticated, type Db, type InboundEvent, type Queryable } from '@masterly/platform';
import type { common, events, platform } from '@masterly/proto';
import { SENDER } from './tokens.js';

export type Channel = 'push' | 'email' | 'sms' | 'in_app';

export interface Draft {
  recipient: string;
  kind: string;
  title: string;
  body: string;
  href: string;
}

/** Провайдер доставки (Web Push / FCM, SMTP, SMS-шлюз). */
export interface ChannelSender {
  send(channel: Exclude<Channel, 'in_app'>, recipient: string, draft: Draft): Promise<void>;
}

/** Каналы по умолчанию — пользователь меняет их в настройках. */
export const DEFAULT_CHANNELS: Record<string, Channel[]> = {
  lead_new: ['in_app', 'push', 'email'],
  lead_response: ['in_app', 'push'],
  lead_status: ['in_app', 'push'],
  review_request: ['in_app', 'push'],
  message: ['in_app', 'push'],
  review_new: ['in_app'],
  moderation: ['in_app', 'email'],
};

interface PreferencesRow {
  recipient: string;
  events: Record<string, Channel[]>;
  quiet_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  timezone: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const rub = (minor: number) => `${Math.round(minor / 100).toLocaleString('ru-RU')} ₽`;

function recipientsOf(context: common.RequestContext | undefined): string[] {
  if (!context?.userId) throw unauthenticated();
  return [`user:${context.userId}`, ...(context.masterId ? [`master:${context.masterId}`] : [])];
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(SENDER) private readonly sender: ChannelSender,
  ) {}

  async inbox(context: common.RequestContext | undefined): Promise<platform.Notification[]> {
    const { rows } = await this.db.query<{ id: string; kind: string; title: string; body: string; href: string; created_at: Date; read_at: Date | null }>(
      'SELECT * FROM notifications WHERE recipient = ANY($1::text[]) ORDER BY id DESC LIMIT 50',
      [recipientsOf(context)],
    );
    return rows.map((row) => ({ id: row.id, kind: row.kind, title: row.title, body: row.body, href: row.href, createdAt: new Date(row.created_at).toISOString(), read: row.read_at !== null }));
  }

  async markAllRead(context: common.RequestContext | undefined): Promise<void> {
    await this.db.query('UPDATE notifications SET read_at = now() WHERE recipient = ANY($1::text[]) AND read_at IS NULL', [recipientsOf(context)]);
  }

  async preferences(context: common.RequestContext | undefined): Promise<platform.Preferences> {
    return toProto(await this.load(recipientsOf(context)[0]!));
  }

  /** Настройки пользователя распространяются и на уведомления его мастерской. */
  async updatePreferences(context: common.RequestContext | undefined, next: platform.Preferences | undefined): Promise<platform.Preferences> {
    if (!next) throw invalid('Нет настроек', 'preferences_required');
    if (!HHMM.test(next.quietStart) || !HHMM.test(next.quietEnd)) throw invalid('Тихие часы в формате ЧЧ:ММ', 'invalid_quiet_hours');
    const eventsMap = Object.fromEntries(Object.entries(next.events).map(([kind, set]) => [kind, set.channels.filter((channel) => ['in_app', 'push', 'email', 'sms'].includes(channel))]));
    for (const recipient of recipientsOf(context)) {
      await this.db.query(
        `INSERT INTO preferences (recipient, events, quiet_enabled, quiet_start, quiet_end, timezone) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (recipient) DO UPDATE SET events = EXCLUDED.events, quiet_enabled = EXCLUDED.quiet_enabled, quiet_start = EXCLUDED.quiet_start,
           quiet_end = EXCLUDED.quiet_end, timezone = EXCLUDED.timezone, updated_at = now()`,
        [recipient, JSON.stringify(eventsMap), next.quietHoursEnabled, next.quietStart, next.quietEnd, next.timezone || 'Europe/Moscow'],
      );
    }
    return this.preferences(context);
  }

  /** Событие домена → черновики уведомлений (кому и что сказать). */
  draftsFor(event: InboundEvent): Draft[] {
    const p = event.payload as never;
    switch (event.type) {
      case 'leads.lead.created.v1': {
        const lead = p as events.LeadCreated;
        const service = serviceById.get(lead.serviceId)?.name ?? 'ремонт';
        return lead.masterIds.map((masterId) => ({ recipient: `master:${masterId}`, kind: 'lead_new', title: 'Новая заявка', body: `Клиент ищет мастера: ${service.toLowerCase()}`, href: `/cabinet/leads/${lead.leadId}` }));
      }
      case 'leads.lead.responded.v1': {
        const response = p as events.LeadResponded;
        return [{ recipient: `user:${response.clientId}`, kind: 'lead_response', title: 'Мастер ответил на заявку', body: `Цена от ${rub(response.priceFromMinor)}${response.etaMin ? `, срок ${response.etaMin} мин` : ''}`, href: `/orders/${response.leadId}` }];
      }
      case 'leads.lead.status_changed.v1': {
        const change = p as events.LeadStatusChanged;
        if (change.toStatus === 'accepted' && change.masterId) return [{ recipient: `master:${change.masterId}`, kind: 'lead_status', title: 'Вас выбрали по заявке', body: 'Свяжитесь с клиентом и подтвердите время', href: `/cabinet/leads/${change.leadId}` }];
        if (change.toStatus === 'completed') return [{ recipient: `user:${change.clientId}`, kind: 'review_request', title: 'Как прошёл ремонт?', body: 'Оцените работу мастера — это помогает другим клиентам', href: `/orders/${change.leadId}?review=1` }];
        if (change.toStatus === 'expired') return [{ recipient: `user:${change.clientId}`, kind: 'lead_status', title: 'Заявка закрыта', body: 'Мастера не успели ответить — создайте заявку заново или напишите мастеру', href: `/orders/${change.leadId}` }];
        return [];
      }
      case 'messaging.message.sent.v1': {
        const message = p as events.MessageSent;
        return [{ recipient: message.recipientId, kind: 'message', title: 'Новое сообщение', body: message.preview, href: `/messages/${message.conversationId}` }];
      }
      case 'reviews.review.created.v1': {
        const review = p as events.ReviewCreated;
        return [{ recipient: `master:${review.masterId}`, kind: 'review_new', title: 'Новый отзыв', body: `Оценка ${review.rating} из 5`, href: '/cabinet/reviews' }];
      }
      case 'trust.moderation.decided.v1': {
        const decision = p as events.ModerationDecided;
        if (decision.kind === 'master' && decision.decision === 'suspend') return [{ recipient: `master:${decision.subjectId}`, kind: 'moderation', title: 'Профиль скрыт модератором', body: 'Откройте кабинет, чтобы узнать причину и исправить профиль', href: '/cabinet/profile' }];
        return [];
      }
      default:
        return [];
    }
  }

  /** В транзакции inbox: запись в ленту + доставки по каналам с учётом тихих часов. Повтор события ничего не дублирует. */
  async enqueue(tx: Queryable, eventId: string, drafts: Draft[], now = new Date()): Promise<void> {
    for (const draft of drafts) {
      const preferences = await this.load(draft.recipient, tx);
      const channels = preferences.events[draft.kind] ?? DEFAULT_CHANNELS[draft.kind] ?? ['in_app'];
      const notificationId = uuidv7();
      if (channels.includes('in_app')) {
        await tx.query('INSERT INTO notifications (id, recipient, kind, title, body, href) VALUES ($1, $2, $3, $4, $5, $6)', [notificationId, draft.recipient, draft.kind, draft.title, draft.body, draft.href]);
      }
      const delay = preferences.quiet_enabled ? quietHoursDelayMs({ start: preferences.quiet_start, end: preferences.quiet_end }, preferences.timezone, now) : 0;
      for (const channel of channels.filter((item) => item !== 'in_app')) {
        await tx.query(
          'INSERT INTO deliveries (id, notification_id, recipient, channel, dedupe_key, scheduled_for) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (dedupe_key) DO NOTHING',
          [uuidv7(), notificationId, draft.recipient, channel, `${eventId}:${draft.recipient}:${channel}`, new Date(now.getTime() + delay)],
        );
      }
    }
  }

  /** Отправка созревших доставок: каждый под берёт свою пачку (SKIP LOCKED); ошибки — повтор с отсрочкой, до 5 попыток. */
  async dispatchDue(limit = 100): Promise<number> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ id: string; notification_id: string; recipient: string; channel: Exclude<Channel, 'in_app'>; attempts: number; title: string | null; body: string | null; href: string | null; kind: string | null }>(
        `SELECT d.*, n.title, n.body, n.href, n.kind FROM deliveries d LEFT JOIN notifications n ON n.id = d.notification_id
          WHERE d.status = 'scheduled' AND d.scheduled_for <= now() ORDER BY d.scheduled_for LIMIT $1 FOR UPDATE OF d SKIP LOCKED`,
        [limit],
      );
      for (const row of rows) {
        try {
          await this.sender.send(row.channel, row.recipient, { recipient: row.recipient, kind: row.kind ?? '', title: row.title ?? '', body: row.body ?? '', href: row.href ?? '' });
          await tx.query("UPDATE deliveries SET status = 'sent', sent_at = now(), attempts = attempts + 1 WHERE id = $1", [row.id]);
        } catch (error) {
          const attempts = row.attempts + 1;
          await tx.query("UPDATE deliveries SET attempts = $2, error = $3, status = CASE WHEN $2 >= 5 THEN 'failed' ELSE 'scheduled' END, scheduled_for = now() + make_interval(secs => 30 * $2) WHERE id = $1", [
            row.id, attempts, String((error as Error).message).slice(0, 300),
          ]);
        }
      }
      return rows.length;
    });
  }

  async erase(tx: Queryable, userId: string): Promise<void> {
    const recipient = `user:${userId}`;
    for (const table of ['preferences', 'notifications', 'deliveries']) await tx.query(`DELETE FROM ${table} WHERE recipient = $1`, [recipient]);
    await tx.query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
  }

  /** Подписка Web Push из PWA: только https-адреса push-сервисов браузеров. */
  async registerPush(request: platform.RegisterPushSubscriptionRequest): Promise<void> {
    const userId = request.context?.userId;
    if (!userId) throw unauthenticated();
    let endpoint: URL;
    try {
      endpoint = new URL(request.endpoint);
    } catch {
      throw invalid('Некорректная подписка', 'invalid_subscription');
    }
    if (endpoint.protocol !== 'https:' || !request.p256dh || !request.auth) throw invalid('Некорректная подписка', 'invalid_subscription');
    await this.db.query(
      `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
      [endpoint.toString(), userId, request.p256dh, request.auth, request.userAgent.slice(0, 200)],
    );
  }

  async unregisterPush(request: platform.UnregisterPushSubscriptionRequest): Promise<void> {
    const userId = request.context?.userId;
    if (!userId) throw unauthenticated();
    await this.db.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [request.endpoint, userId]);
  }

  private async load(recipient: string, q: Queryable = this.db): Promise<PreferencesRow> {
    const row = (await q.query<PreferencesRow>('SELECT * FROM preferences WHERE recipient = $1', [recipient])).rows[0];
    return row ?? { recipient, events: {}, quiet_enabled: true, quiet_start: '22:00', quiet_end: '08:00', timezone: 'Europe/Moscow' };
  }
}

function toProto(row: PreferencesRow): platform.Preferences {
  const kinds = new Set([...Object.keys(DEFAULT_CHANNELS), ...Object.keys(row.events)]);
  return {
    events: Object.fromEntries([...kinds].map((kind) => [kind, { channels: row.events[kind] ?? DEFAULT_CHANNELS[kind] ?? [] }])),
    quietHoursEnabled: row.quiet_enabled,
    quietStart: row.quiet_start,
    quietEnd: row.quiet_end,
    timezone: row.timezone,
  };
}
