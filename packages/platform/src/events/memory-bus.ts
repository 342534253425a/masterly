import { dispatch, type EventBus, type EventHandlers } from './bus.js';
import { decodeEvent, type RawRecord } from './codec.js';
import type { EventPayloads, EventType } from './registry.js';

/**
 * Шина в памяти для тестов: публикация копит сообщения, drain() доставляет их подписчикам
 * (включая события, порождённые обработчиками) — сквозные сценарии без Kafka.
 * Кодек тот же, что в проде: protobuf + заголовки CloudEvents.
 */
export class InMemoryEventBus implements EventBus {
  readonly published: RawRecord[] = [];
  private readonly queue: RawRecord[] = [];
  private readonly subscriptions: Array<{ group: string; handlers: EventHandlers }> = [];

  async publish(records: RawRecord[]): Promise<void> {
    this.published.push(...records);
    this.queue.push(...records);
  }

  async subscribe(group: string, handlers: EventHandlers): Promise<void> {
    this.subscriptions.push({ group, handlers });
  }

  /** Доставляет всё накопленное; возвращает число доставленных сообщений. */
  async drain(): Promise<number> {
    let delivered = 0;
    for (let record = this.queue.shift(); record; record = this.queue.shift()) {
      for (const { handlers } of this.subscriptions) await dispatch(handlers, record);
      delivered++;
    }
    return delivered;
  }

  /** Опубликованные события данного типа (декодированные). */
  events<T extends EventType>(type: T): Array<EventPayloads[T]> {
    return this.published.filter((record) => record.headers.ce_type === type).map((record) => decodeEvent(type, record.value));
  }

  async close(): Promise<void> {}
}
