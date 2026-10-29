import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '@masterly/kernel';
import { AppError, DB, enqueue, invalid, KV, notFound, unauthenticated, type Db, type KeyValueStore, type Queryable } from '@masterly/platform';
import type { common, events, messaging } from '@masterly/proto';
import { ChatNotifier, type ChatDelivery } from './realtime.js';

const SOURCE = 'messaging';
const MESSAGES_PER_MINUTE = 30;
const ZERO = '00000000-0000-0000-0000-000000000000';

interface ConversationRow { id: string; lead_id: string | null; client_id: string; master_id: string; subject: string; last_message_text: string; last_message_at: Date; unread?: number }
type ConversationRef = Pick<ConversationRow, 'id' | 'client_id' | 'master_id'>;
interface MessageRow { id: string; conversation_id: string; author_id: string | null; kind: string; text: string; client_id: string | null; created_at: Date }

function participant(context: common.RequestContext | undefined) {
  if (!context?.userId) throw unauthenticated();
  return { userId: context.userId, masterId: context.masterId || '' };
}

const formatRub = (minor: number) => `${Math.round(minor / 100).toLocaleString('ru-RU')} ₽`;

@Injectable()
export class MessagingService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KV) private readonly kv: KeyValueStore,
    private readonly notifier: ChatNotifier,
  ) {}

  /** Диалоги пользователя: как клиента и как мастера; непрочитанные считаются от маркера прочтения. */
  async list(context: common.RequestContext | undefined, page: common.PageRequest | undefined): Promise<messaging.Conversation[]> {
    const me = participant(context);
    const limit = Math.min(Math.max(page?.limit || 30, 1), 100);
    const { rows } = await this.db.query<ConversationRow>(
      `SELECT c.*, (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.id > coalesce(rm.last_read_id, $3::uuid) AND m.author_id IS DISTINCT FROM $1::uuid) AS unread
         FROM conversations c LEFT JOIN read_markers rm ON rm.conversation_id = c.id AND rm.user_id = $1::uuid
        WHERE c.client_id = $1::uuid OR ($2::text <> '' AND c.master_id::text = $2::text)
        ORDER BY c.last_message_at DESC LIMIT ${limit}`,
      [me.userId, me.masterId, ZERO],
    );
    return rows.map(toConversation);
  }

  async messages(request: messaging.ListMessagesRequest): Promise<messaging.ListMessagesResponse> {
    const me = participant(request.context);
    const conversation = await this.conversationFor(me, request.conversationId);
    const limit = Math.min(Math.max(request.limit || 50, 1), 100);
    const { rows } = request.beforeId
      ? await this.db.query<MessageRow>(`SELECT * FROM messages WHERE conversation_id = $1 AND id < $2::uuid ORDER BY id DESC LIMIT ${limit}`, [conversation.id, request.beforeId])
      : await this.db.query<MessageRow>(`SELECT * FROM messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT ${limit}`, [conversation.id]);
    if (!request.beforeId && rows[0]) {
      await this.db.query('INSERT INTO read_markers (conversation_id, user_id, last_read_id) VALUES ($1, $2, $3) ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_id = GREATEST(read_markers.last_read_id, EXCLUDED.last_read_id)', [conversation.id, me.userId, rows[0].id]);
    }
    return { conversation: toConversation({ ...conversation, unread: 0 }), messages: rows.reverse().map(toMessage), nextCursor: rows.length === limit ? rows[0]!.id : '' };
  }

  async send(request: messaging.SendMessageRequest): Promise<messaging.Message> {
    const me = participant(request.context);
    const text = request.text.trim();
    if (text.length === 0 || text.length > 4000) throw invalid('Сообщение — от 1 до 4000 символов', 'invalid_text');
    if ((await this.kv.incr(`msg-rate:${me.userId}:${Math.floor(Date.now() / 60_000)}`, 60_000)) > MESSAGES_PER_MINUTE) throw new AppError('RESOURCE_EXHAUSTED', 'Слишком много сообщений подряд', 'message_rate');
    const conversation = await this.conversationFor(me, request.conversationId);
    const { id, created } = await this.db.transaction(async (tx) => {
      if (request.clientId) {
        const known = await tx.query<{ message_id: string }>('SELECT message_id FROM message_dedupe WHERE conversation_id = $1 AND client_id = $2', [conversation.id, request.clientId]);
        if (known.rows[0]) return { id: known.rows[0].message_id, created: false };
      }
      const messageId = uuidv7();
      await this.insert(tx, conversation.id, messageId, me.userId, 'text', text, request.clientId || null);
      if (request.clientId) await tx.query('INSERT INTO message_dedupe (conversation_id, client_id, message_id) VALUES ($1, $2, $3)', [conversation.id, request.clientId, messageId]);
      const fromClient = conversation.client_id === me.userId;
      await enqueue(tx, SOURCE, [
        {
          type: 'messaging.message.sent.v1',
          key: conversation.id,
          payload: { messageId, conversationId: conversation.id, authorId: me.userId, recipientId: fromClient ? `master:${conversation.master_id}` : `user:${conversation.client_id}`, preview: text.slice(0, 80), at: new Date().toISOString() },
        },
      ]);
      return { id: messageId, created: true };
    });
    // Живая доставка — после коммита: вкладки собеседника и другие устройства автора перечитают диалог
    if (created) await this.notifier.notify([{ conversationId: conversation.id, clientId: conversation.client_id, masterId: conversation.master_id, messageId: id, kind: 'text' }]);
    const row = (await this.db.query<MessageRow>('SELECT * FROM messages WHERE id = $1', [id])).rows[0]!;
    return toMessage(row);
  }

  /** Прямой диалог клиента с мастером (без заявки) или диалог по заявке — один на пару. */
  async start(request: messaging.StartConversationRequest): Promise<messaging.Conversation> {
    const me = participant(request.context);
    if (!request.masterId) throw invalid('Не указан мастер', 'master_required');
    const leadId = request.leadId || null;
    await this.db.query(
      leadId
        ? 'INSERT INTO conversations (id, lead_id, client_id, master_id) VALUES ($1, $2, $3, $4) ON CONFLICT (lead_id, master_id) WHERE lead_id IS NOT NULL DO NOTHING'
        : 'INSERT INTO conversations (id, lead_id, client_id, master_id) VALUES ($1, $2, $3, $4) ON CONFLICT (client_id, master_id) WHERE lead_id IS NULL DO NOTHING',
      [uuidv7(), leadId, me.userId, request.masterId],
    );
    const { rows } = leadId
      ? await this.db.query<ConversationRow>('SELECT * FROM conversations WHERE lead_id = $1 AND master_id = $2', [leadId, request.masterId])
      : await this.db.query<ConversationRow>('SELECT * FROM conversations WHERE client_id = $1 AND master_id = $2 AND lead_id IS NULL', [me.userId, request.masterId]);
    const conversation = rows[0]!;
    if (conversation.client_id !== me.userId) throw notFound('Диалог не найден');
    return toConversation({ ...conversation, unread: 0 });
  }

  /**
   * Системные сообщения по событиям заявки. Возвращают доставки для живого канала: их публикуют после коммита
   * транзакции inbox, чтобы вкладка не перечитала диалог раньше, чем сообщение станет видно.
   */
  async onLeadCreated(tx: Queryable, event: events.LeadCreated): Promise<ChatDelivery[]> {
    const deliveries: ChatDelivery[] = [];
    for (const masterId of event.masterIds) {
      const id = uuidv7();
      const created = await tx.query(
        'INSERT INTO conversations (id, lead_id, client_id, master_id, subject) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (lead_id, master_id) WHERE lead_id IS NOT NULL DO NOTHING',
        [id, event.leadId, event.clientId, masterId, 'Заявка'],
      );
      if (created.rowCount > 0) deliveries.push(await this.system(tx, { id, client_id: event.clientId, master_id: masterId }, 'Новая заявка: клиент описал проблему, ответьте ценой и сроком'));
    }
    return deliveries;
  }

  async onLeadResponded(tx: Queryable, event: events.LeadResponded): Promise<ChatDelivery[]> {
    const conversation = await this.leadConversation(tx, event.leadId, event.masterId);
    if (!conversation) return [];
    const eta = event.etaMin > 0 ? `, срок ${event.etaMin} мин` : '';
    return [await this.system(tx, conversation, `Мастер ответил: от ${formatRub(event.priceFromMinor)}${eta}`)];
  }

  async onLeadStatusChanged(tx: Queryable, event: events.LeadStatusChanged): Promise<ChatDelivery[]> {
    const texts: Record<string, string> = { accepted: 'Клиент выбрал этого мастера', in_progress: 'Мастер приступил к работе', completed: 'Заявка выполнена', cancelled: 'Клиент отменил заявку' };
    const text = texts[event.toStatus];
    if (!text || !event.masterId) return [];
    const conversation = await this.leadConversation(tx, event.leadId, event.masterId);
    return conversation ? [await this.system(tx, conversation, text)] : [];
  }

  /** Удаление аккаунта: тексты сообщений автора стираются, диалоги собеседника остаются связными. */
  async eraseAuthor(tx: Queryable, userId: string): Promise<void> {
    await tx.query("UPDATE messages SET text = '[сообщение удалено]', author_id = NULL WHERE author_id = $1", [userId]);
    await tx.query('DELETE FROM read_markers WHERE user_id = $1', [userId]);
  }

  private async leadConversation(tx: Queryable, leadId: string, masterId: string): Promise<ConversationRef | undefined> {
    return (await tx.query<ConversationRef>('SELECT id, client_id, master_id FROM conversations WHERE lead_id = $1 AND master_id = $2', [leadId, masterId])).rows[0];
  }

  private async system(tx: Queryable, conversation: ConversationRef, text: string): Promise<ChatDelivery> {
    const messageId = uuidv7();
    await this.insert(tx, conversation.id, messageId, null, 'system', text);
    return { conversationId: conversation.id, clientId: conversation.client_id, masterId: conversation.master_id, messageId, kind: 'system' };
  }

  private async insert(tx: Queryable, conversationId: string, id: string, authorId: string | null, kind: string, text: string, clientId: string | null = null): Promise<void> {
    await tx.query('INSERT INTO messages (id, conversation_id, author_id, kind, text, client_id) VALUES ($1, $2, $3, $4, $5, $6)', [id, conversationId, authorId, kind, text, clientId]);
    await tx.query('UPDATE conversations SET last_message_text = $2, last_message_at = now() WHERE id = $1', [conversationId, text.slice(0, 200)]);
  }

  private async conversationFor(me: { userId: string; masterId: string }, conversationId: string): Promise<ConversationRow> {
    const row = /^[0-9a-f-]{36}$/i.test(conversationId) ? (await this.db.query<ConversationRow>('SELECT * FROM conversations WHERE id = $1', [conversationId])).rows[0] : undefined;
    if (!row || (row.client_id !== me.userId && row.master_id !== me.masterId)) throw notFound('Диалог не найден');
    return row;
  }
}

function toConversation(row: ConversationRow): messaging.Conversation {
  return {
    id: row.id, leadId: row.lead_id ?? '', clientId: row.client_id, masterId: row.master_id, subject: row.subject,
    lastMessageText: row.last_message_text, lastMessageAt: new Date(row.last_message_at).toISOString(), unread: row.unread ?? 0,
  };
}

function toMessage(row: MessageRow): messaging.Message {
  return { id: row.id, conversationId: row.conversation_id, authorId: row.author_id ?? '', kind: row.kind, text: row.text, clientId: row.client_id ?? '', createdAt: new Date(row.created_at).toISOString(), status: 'sent' };
}
