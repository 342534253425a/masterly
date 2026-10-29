import type { Cluster, Redis } from 'ioredis';
import { createRedisClient } from '../cache/kv.js';

export type PubSubListener = (message: string) => void;

/**
 * Межподовая доставка коротких сигналов: Redis/Valkey Pub/Sub. At-most-once и без хранения — годится для
 * «обнови экран», но не для данных: источник истины остаётся в БД, клиент дочитывает пропущенное запросом.
 */
export interface PubSub {
  publish(channel: string, message: string): Promise<void>;
  /** Подписка на канал; возвращает отписку. Каналы мультиплексируются на одном соединении. */
  subscribe(channel: string, listener: PubSubListener): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

/** Слушатели процесса над одной подпиской на канал: тысячи сокетов пода — одна подписка в Redis на пользователя. */
abstract class MultiplexedPubSub implements PubSub {
  private readonly listeners = new Map<string, Set<PubSubListener>>();

  abstract publish(channel: string, message: string): Promise<void>;
  abstract close(): Promise<void>;
  protected abstract open(channel: string): Promise<void>;
  protected abstract shut(channel: string): Promise<void>;

  protected deliver(channel: string, message: string): void {
    for (const listener of this.listeners.get(channel) ?? []) listener(message);
  }

  async subscribe(channel: string, listener: PubSubListener): Promise<() => Promise<void>> {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
      await this.open(channel);
    }
    set.add(listener);
    return async () => {
      const current = this.listeners.get(channel);
      if (!current?.delete(listener) || current.size > 0) return;
      this.listeners.delete(channel);
      await this.shut(channel);
    };
  }
}

/** Отдельные соединения на публикацию и подписку: соединение в режиме SUBSCRIBE не выполняет других команд. */
export class RedisPubSub extends MultiplexedPubSub {
  private readonly publisher: Redis | Cluster;
  private readonly subscriber: Redis | Cluster;

  constructor(url: string, options: { cluster?: boolean } = {}) {
    super();
    // Публикация не ждёт переподключения: сигнал без Redis теряется, клиенты дочитают опросом
    this.publisher = createRedisClient(url, { cluster: options.cluster, redis: { commandTimeout: 200, maxRetriesPerRequest: 1, enableOfflineQueue: false } });
    // Подписчик ждёт соединения и после разрыва сам восстанавливает подписки (autoResubscribe)
    this.subscriber = createRedisClient(url, { cluster: options.cluster, redis: { maxRetriesPerRequest: null, autoResubscribe: true } });
    this.subscriber.on('message', (channel: string, message: string) => this.deliver(channel, message));
    // Разрывы видны на вызовах и в переподключениях; событие error без слушателя засоряло бы лог
    for (const client of [this.publisher, this.subscriber]) client.on('error', () => undefined);
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.publisher.publish(channel, message);
  }

  protected async open(channel: string): Promise<void> {
    await this.subscriber.subscribe(channel);
  }

  protected async shut(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.publisher.quit(), this.subscriber.quit()]);
  }
}

/** Pub/Sub процесса: тесты и локальный запуск без Redis (один под). Доставка асинхронная, как у Redis. */
export class MemoryPubSub extends MultiplexedPubSub {
  async publish(channel: string, message: string): Promise<void> {
    queueMicrotask(() => this.deliver(channel, message));
  }

  protected async open(): Promise<void> {}
  protected async shut(): Promise<void> {}
  async close(): Promise<void> {}
}
