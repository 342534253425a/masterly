import { decodeRecord, type InboundEvent, type RawRecord } from './codec.js';
import type { EventType } from './registry.js';

export type EventHandler<T extends EventType> = (event: InboundEvent<T>) => Promise<void>;
export type EventHandlers = { [T in EventType]?: EventHandler<T> };

/** Шина событий: KafkaJS в проде, InMemoryEventBus в тестах (@masterly/platform/testing). */
export interface EventBus {
  publish(records: RawRecord[]): Promise<void>;
  /** Подписка consumer-группы. Топики выводятся из типов событий в handlers. */
  subscribe(group: string, handlers: EventHandlers): Promise<void>;
  close(): Promise<void>;
}

/** Вызывает обработчик события; false — тип не интересен этой группе (сообщение просто пропускается). */
export async function dispatch(handlers: EventHandlers, record: RawRecord, attempt = 0): Promise<boolean> {
  const event = decodeRecord(record, attempt);
  if (!event) return false;
  const handler = handlers[event.type] as EventHandler<EventType> | undefined;
  if (!handler) return false;
  await handler(event);
  return true;
}
