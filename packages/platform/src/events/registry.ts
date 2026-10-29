import type { events } from '@masterly/proto';

/** Типы событий → protobuf-сообщение и топик (docs/architecture/events.md#3-топики). */
export interface EventPayloads {
  'identity.account.deletion_requested.v1': events.AccountDeletionRequested;
  'identity.account.consent_changed.v1': events.ConsentChanged;
  'catalog.master.upserted.v1': events.MasterUpserted;
  'catalog.master.deleted.v1': events.MasterDeleted;
  'leads.lead.created.v1': events.LeadCreated;
  'leads.lead.responded.v1': events.LeadResponded;
  'leads.lead.status_changed.v1': events.LeadStatusChanged;
  'leads.contact.revealed.v1': events.ContactRevealed;
  'reviews.review.created.v1': events.ReviewCreated;
  'reviews.rating.aggregated.v1': events.RatingAggregated;
  'messaging.message.sent.v1': events.MessageSent;
  'media.asset.uploaded.v1': events.MediaUploaded;
  'trust.moderation.decided.v1': events.ModerationDecided;
  'analytics.search.performed.v1': events.SearchPerformed;
  'analytics.product.tracked.v1': events.ProductEvent;
}

export type EventType = keyof EventPayloads;

export const EVENTS = {
  'identity.account.deletion_requested.v1': { topic: 'identity.account.v1', message: 'AccountDeletionRequested' },
  'identity.account.consent_changed.v1': { topic: 'identity.account.v1', message: 'ConsentChanged' },
  'catalog.master.upserted.v1': { topic: 'catalog.master.v1', message: 'MasterUpserted' },
  'catalog.master.deleted.v1': { topic: 'catalog.master.v1', message: 'MasterDeleted' },
  'leads.lead.created.v1': { topic: 'leads.lead.v1', message: 'LeadCreated' },
  'leads.lead.responded.v1': { topic: 'leads.lead.v1', message: 'LeadResponded' },
  'leads.lead.status_changed.v1': { topic: 'leads.lead.v1', message: 'LeadStatusChanged' },
  'leads.contact.revealed.v1': { topic: 'leads.lead.v1', message: 'ContactRevealed' },
  'reviews.review.created.v1': { topic: 'reviews.review.v1', message: 'ReviewCreated' },
  'reviews.rating.aggregated.v1': { topic: 'reviews.rating.v1', message: 'RatingAggregated' },
  'messaging.message.sent.v1': { topic: 'messaging.message.v1', message: 'MessageSent' },
  'media.asset.uploaded.v1': { topic: 'media.asset.v1', message: 'MediaUploaded' },
  'trust.moderation.decided.v1': { topic: 'trust.moderation.v1', message: 'ModerationDecided' },
  'analytics.search.performed.v1': { topic: 'analytics.search.v1', message: 'SearchPerformed' },
  'analytics.product.tracked.v1': { topic: 'analytics.events.v1', message: 'ProductEvent' },
} as const satisfies { [T in EventType]: { topic: string; message: string } };

export type Topic = (typeof EVENTS)[EventType]['topic'];

export function isEventType(value: string): value is EventType {
  return Object.hasOwn(EVENTS, value);
}

/** Сообщение для outbox / прямой публикации: тип, ключ (id агрегата) и типизированное тело. */
export type OutgoingEvent = { [T in EventType]: { type: T; key: string; payload: EventPayloads[T] } }[EventType];
