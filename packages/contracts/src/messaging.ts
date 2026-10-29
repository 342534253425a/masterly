import { z } from 'zod';
import { DateTime, Id } from './common.js';

export const Conversation = z.object({
  id: Id,
  leadId: Id.nullable(),
  peer: z.object({
    id: Id,
    name: z.string(),
    initials: z.string(),
    hue: z.number().int(),
    kind: z.enum(['master', 'client', 'support']),
    slug: z.string().nullable(),
    online: z.boolean(),
  }),
  subject: z.string().nullable(),
  lastMessage: z.object({ text: z.string(), at: DateTime, fromMe: z.boolean() }).nullable(),
  unread: z.number().int(),
  updatedAt: DateTime,
});
export type Conversation = z.infer<typeof Conversation>;

export const Message = z.object({
  id: Id,
  conversationId: Id,
  clientId: z.string().nullable(),
  fromMe: z.boolean(),
  kind: z.enum(['text', 'system', 'offer']),
  text: z.string(),
  createdAt: DateTime,
  status: z.enum(['sent', 'delivered', 'read']),
});
export type Message = z.infer<typeof Message>;

export const MessagesPage = z.object({
  conversation: Conversation,
  items: z.array(Message),
  nextCursor: z.string().nullable(),
});
export type MessagesPage = z.infer<typeof MessagesPage>;

/** clientId — ключ идемпотентности: повторная отправка при плохой сети не создаёт дубль. */
export const SendMessage = z.object({
  text: z.string().trim().min(1).max(4000),
  clientId: z.string().min(8).max(64),
});
export type SendMessage = z.infer<typeof SendMessage>;

export const StartConversation = z.object({ masterId: Id, leadId: Id.nullable().default(null) });

export const Notification = z.object({
  id: Id,
  kind: z.enum(['lead', 'message', 'review', 'system', 'moderation']),
  title: z.string(),
  body: z.string(),
  href: z.string().nullable(),
  createdAt: DateTime,
  read: z.boolean(),
});
export type Notification = z.infer<typeof Notification>;
