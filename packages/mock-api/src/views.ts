import type { CabinetLead, Conversation, Lead, LeadSummary, Message, PriceRange, User } from '@masterly/contracts';
import { modelById, Rng, serviceById } from '@masterly/fixtures';
import { formatRuPhone, maskPhone } from '@masterly/kernel';
import { getDb, type DbConversation, type DbLead, type DbMessage, type DbUser } from './db.js';
import { initialsOf, toMasterLite } from './mappers.js';

export const shortName = (name: string) => {
  const [first = '', last = ''] = name.split(' ');
  return last ? `${first} ${last[0]}.` : first;
};

export function toUser(user: DbUser, role = user.activeRole): User {
  return {
    id: user.id,
    name: user.name,
    initials: initialsOf(user.name),
    hue: user.hue,
    phoneMasked: maskPhone(user.phone),
    email: user.email,
    roles: user.roles,
    activeRole: role,
    masterId: user.masterId,
    cityId: user.cityId,
    createdAt: user.createdAt,
  };
}

const ref = (lead: DbLead) => {
  const service = serviceById.get(lead.serviceId);
  const model = lead.modelId ? modelById.get(lead.modelId) : undefined;
  return { service: { id: lead.serviceId, name: service?.name ?? lead.serviceId }, model: model ? { id: model.id, name: model.fullName } : null };
};

const lite = (masterId: string) => {
  const master = getDb().masterById.get(masterId);
  if (!master) throw new Error(`Unknown master ${masterId}`);
  return toMasterLite(master);
};

function bestPrice(lead: DbLead): PriceRange | null {
  const prices = lead.responses.map((r) => r.price).filter((p): p is PriceRange => p !== null);
  if (prices.length === 0) return null;
  return prices.reduce((best, p) => (p.from < best.from ? p : best));
}

export function toLeadSummary(lead: DbLead): LeadSummary {
  return {
    id: lead.id,
    number: lead.number,
    status: lead.status,
    ...ref(lead),
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    recipientsCount: lead.recipients.length,
    responsesCount: lead.responses.length,
    bestPrice: bestPrice(lead),
    master: lead.acceptedMasterId ? lite(lead.acceptedMasterId) : null,
  };
}

export function toLead(lead: DbLead): Lead {
  return {
    ...toLeadSummary(lead),
    description: lead.description,
    urgency: lead.urgency,
    visitType: lead.visitType,
    preferredChannel: lead.preferredChannel,
    sharePhone: lead.sharePhone,
    cityId: lead.cityId,
    recipients: lead.recipients.map((r) => ({ master: lite(r.masterId), status: r.status, viewedAt: r.viewedAt })),
    responses: lead.responses.map((r) => ({ id: r.id, master: lite(r.masterId), price: r.price, message: r.message, etaMin: r.etaMin, createdAt: r.createdAt, status: r.status })),
    timeline: lead.timeline,
    conversationId: lead.conversationId,
    canReview: lead.status === 'completed' && lead.reviewId === null,
    reviewId: lead.reviewId,
  };
}

export function toCabinetLead(lead: DbLead, masterId: string): CabinetLead {
  const db = getDb();
  const client = db.users.get(lead.clientId);
  const recipient = lead.recipients.find((r) => r.masterId === masterId);
  const response = lead.responses.find((r) => r.masterId === masterId);
  const conversation = [...db.conversations.values()].find((c) => c.leadId === lead.id && c.masterId === masterId);
  return {
    id: lead.id,
    number: lead.number,
    status: recipient?.status ?? lead.status,
    createdAt: lead.createdAt,
    expiresAt: lead.expiresAt,
    client: {
      name: shortName(client?.name ?? 'Клиент'),
      initials: initialsOf(client?.name ?? 'К'),
      phone: lead.sharePhone && client ? formatRuPhone(client.phone) : null,
      leadsCount: [...db.leads.values()].filter((l) => l.clientId === lead.clientId).length,
    },
    ...ref(lead),
    description: lead.description,
    urgency: lead.urgency,
    visitType: lead.visitType,
    distanceKm: Number(new Rng(`distance:${lead.id}`).float(0.4, 7.5).toFixed(1)),
    myResponse: response ? { id: response.id, master: lite(masterId), price: response.price, message: response.message, etaMin: response.etaMin, createdAt: response.createdAt, status: response.status } : null,
    competitors: Math.max(0, lead.recipients.length - 1),
    conversationId: conversation?.id ?? null,
  };
}

export type Viewer = 'client' | 'master';

export function viewerOf(conversation: DbConversation, user: DbUser, role: string): Viewer | null {
  if (role === 'master' && conversation.masterId && conversation.masterId === user.masterId) return 'master';
  if (conversation.clientId === user.id) return 'client';
  return null;
}

const isMine = (message: DbMessage, viewer: Viewer) => message.author === viewer;

export function toMessage(message: DbMessage, conversation: DbConversation, viewer: Viewer): Message {
  const peerReadAt = viewer === 'client' ? conversation.readAt.master : conversation.readAt.client;
  return {
    id: message.id,
    conversationId: conversation.id,
    clientId: message.clientId,
    fromMe: isMine(message, viewer),
    kind: message.kind,
    text: message.text,
    createdAt: message.createdAt,
    status: isMine(message, viewer) ? (message.createdAt <= peerReadAt ? 'read' : 'delivered') : 'read',
  };
}

export function toConversation(conversation: DbConversation, viewer: Viewer): Conversation {
  const db = getDb();
  const last = conversation.messages.at(-1);
  const myReadAt = viewer === 'client' ? conversation.readAt.client : conversation.readAt.master;
  let peer: Conversation['peer'];
  if (viewer === 'client') {
    const master = conversation.masterId ? db.masterById.get(conversation.masterId) : undefined;
    peer = master
      ? { id: master.id, name: master.name, initials: master.initials, hue: master.hue, kind: 'master', slug: master.slug, online: new Rng(`online:${master.id}`).chance(0.6) }
      : { id: 'support', name: 'Поддержка Masterly', initials: 'M', hue: 265, kind: 'support', slug: null, online: true };
  } else {
    const client = db.users.get(conversation.clientId);
    peer = { id: conversation.clientId, name: shortName(client?.name ?? 'Клиент'), initials: initialsOf(client?.name ?? 'К'), hue: client?.hue ?? 200, kind: 'client', slug: null, online: false };
  }
  return {
    id: conversation.id,
    leadId: conversation.leadId,
    peer,
    subject: conversation.subject,
    lastMessage: last ? { text: last.text, at: last.createdAt, fromMe: isMine(last, viewer) } : null,
    unread: conversation.messages.filter((m) => !isMine(m, viewer) && m.author !== 'system' && m.createdAt > myReadAt).length,
    updatedAt: last?.createdAt ?? new Date().toISOString(),
  };
}
