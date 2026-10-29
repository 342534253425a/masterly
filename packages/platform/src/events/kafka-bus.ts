import { BrokenCircuitError } from 'cockatiel';
import {
  CompressionTypes,
  Kafka,
  logLevel,
  type Admin,
  type Consumer,
  type EachBatchPayload,
  type EachMessagePayload,
  type IHeaders,
  type KafkaMessage,
  type Producer,
} from 'kafkajs';
import type { Logger } from 'pino';
import { toAppError } from '../errors.js';
import { metrics } from '../metrics.js';
import { dispatch, type EventBus, type EventHandlers } from './bus.js';
import { PermanentEventError, type RawRecord } from './codec.js';
import { EVENTS, type EventType } from './registry.js';

/** Повторы в процессе (с jitter), затем <topic>.retry с фиксированной задержкой, затем <topic>.dlq. */
const IN_PROCESS_DELAYS_MS = [100, 400, 1600];
const RETRY_DELAY_MS = 30_000;
const MAX_TOPIC_RETRIES = 5;
const OUTAGE_PAUSE_MS = 10_000;

export interface KafkaBusOptions {
  clientId: string;
  brokers: string[];
  ssl?: boolean;
  sasl?: { username: string; password: string };
  logger: Logger;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class KafkaEventBus implements EventBus {
  private readonly kafka: Kafka;
  private producer?: Promise<Producer>;
  private admin?: Promise<Admin>;
  private readonly consumers: Consumer[] = [];
  private readonly groups = new Map<string, string[]>();
  private lagTimer?: NodeJS.Timeout;
  private closing = false;

  constructor(private readonly options: KafkaBusOptions) {
    this.kafka = new Kafka({
      clientId: options.clientId,
      brokers: options.brokers,
      ssl: options.ssl,
      sasl: options.sasl ? { mechanism: 'scram-sha-512', ...options.sasl } : undefined,
      logLevel: logLevel.WARN,
      retry: { initialRetryTime: 100, retries: 8 },
      logCreator: () => (entry) => {
        const { message, ...rest } = entry.log;
        options.logger.warn({ kafka: entry.namespace, ...rest }, message);
      },
    });
  }

  async publish(records: RawRecord[]): Promise<void> {
    if (records.length === 0) return;
    const producer = await this.getProducer();
    const byTopic = new Map<string, RawRecord[]>();
    for (const record of records) byTopic.set(record.topic, [...(byTopic.get(record.topic) ?? []), record]);
    await producer.sendBatch({
      acks: -1,
      compression: CompressionTypes.GZIP,
      topicMessages: [...byTopic].map(([topic, list]) => ({
        topic,
        messages: list.map((record) => ({ key: record.key, value: record.headers['x-tombstone'] === '1' ? null : Buffer.from(record.value), headers: record.headers })),
      })),
    });
    for (const [topic, list] of byTopic) metrics.kafkaProduced.inc({ topic }, list.length);
  }

  async subscribe(group: string, handlers: EventHandlers): Promise<void> {
    const topics = [...new Set((Object.keys(handlers) as EventType[]).map((type) => EVENTS[type].topic))];
    this.groups.set(group, topics);

    const main = this.kafka.consumer({ groupId: group, allowAutoTopicCreation: false });
    await main.connect();
    await main.subscribe({ topics, fromBeginning: true });
    await main.run({
      eachBatchAutoResolve: false,
      partitionsConsumedConcurrently: 3,
      eachBatch: (payload) => this.consumeBatch(main, group, handlers, payload),
    });

    const retry = this.kafka.consumer({ groupId: `${group}.retry`, allowAutoTopicCreation: false });
    await retry.connect();
    await retry.subscribe({ topics: topics.map((topic) => `${topic}.retry`), fromBeginning: true });
    await retry.run({ partitionsConsumedConcurrently: 3, eachMessage: (payload) => this.consumeRetry(group, handlers, payload) });

    this.consumers.push(main, retry);
    this.lagTimer ??= setInterval(() => void this.reportLag().catch(() => undefined), 15_000);
    this.lagTimer.unref();
  }

  async close(): Promise<void> {
    this.closing = true;
    clearInterval(this.lagTimer);
    await Promise.allSettled(this.consumers.map((consumer) => consumer.disconnect()));
    await Promise.allSettled([this.producer?.then((p) => p.disconnect()), this.admin?.then((a) => a.disconnect())]);
  }

  /**
   * Батч группируется по ключу: разные агрегаты обрабатываются параллельно, события одного — строго по порядку.
   * Offset двигается только по непрерывному префиксу обработанных сообщений; остальные придут повторно (inbox отсечёт дубли).
   */
  private async consumeBatch(consumer: Consumer, group: string, handlers: EventHandlers, payload: EachBatchPayload): Promise<void> {
    const { batch, resolveOffset, heartbeat, commitOffsetsIfNecessary, isRunning, isStale, pause } = payload;
    const byKey = new Map<string, KafkaMessage[]>();
    for (const message of batch.messages) {
      const key = message.key?.toString() ?? '';
      byKey.set(key, [...(byKey.get(key) ?? []), message]);
    }

    const done = new Set<string>();
    let outage = false;
    await Promise.all(
      [...byKey.values()].map(async (messages) => {
        for (const message of messages) {
          if (outage || !isRunning() || isStale()) return;
          const result = await this.handle(group, handlers, toRecord(batch.topic, message), 0);
          if (result === 'outage') {
            outage = true;
            return;
          }
          done.add(message.offset);
          metrics.kafkaConsumed.inc({ topic: batch.topic });
        }
      }),
    );

    let firstPending: string | undefined;
    for (const message of batch.messages) {
      if (!done.has(message.offset)) {
        firstPending = message.offset;
        break;
      }
      resolveOffset(message.offset);
    }
    await commitOffsetsIfNecessary();
    await heartbeat();

    if (outage && firstPending !== undefined) {
      // Зависимость лежит (breaker открыт): сообщения ждут в топике, а не уходят в DLQ
      consumer.seek({ topic: batch.topic, partition: batch.partition, offset: firstPending });
      const resume = pause();
      setTimeout(resume, OUTAGE_PAUSE_MS).unref();
      this.options.logger.warn({ group, topic: batch.topic, partition: batch.partition }, 'зависимость недоступна — партиция на паузе');
    }
  }

  private async consumeRetry(group: string, handlers: EventHandlers, payload: EachMessagePayload): Promise<void> {
    const headers = decodeHeaders(payload.message.headers);
    if (headers['x-consumer-group'] !== group) return; // повтор адресован другой группе
    const due = Number(headers['x-retry-after'] ?? 0);
    while (Date.now() < due && !this.closing) {
      await sleep(Math.min(3_000, due - Date.now()));
      await payload.heartbeat();
    }
    const record = toRecord(headers['x-original-topic'] ?? payload.topic.replace(/\.retry$/, ''), payload.message);
    while ((await this.handle(group, handlers, record, Number(headers['x-retry-count'] ?? 1))) === 'outage' && !this.closing) {
      await sleep(OUTAGE_PAUSE_MS);
      await payload.heartbeat();
    }
  }

  /** 'ok' — обработано либо переложено в retry/DLQ; 'outage' — зависимость недоступна целиком. */
  private async handle(group: string, handlers: EventHandlers, record: RawRecord, attempt: number): Promise<'ok' | 'outage'> {
    let lastError: unknown;
    for (let i = 0; ; i++) {
      try {
        await dispatch(handlers, record, attempt);
        return 'ok';
      } catch (error) {
        lastError = error;
        if (error instanceof BrokenCircuitError) return 'outage';
        const delay = IN_PROCESS_DELAYS_MS[i];
        if (isPermanent(error) || delay === undefined) break;
        await sleep(delay * (0.5 + Math.random()));
      }
    }
    await this.reroute(group, record, attempt, lastError);
    return 'ok';
  }

  private async reroute(group: string, record: RawRecord, attempt: number, error: unknown): Promise<void> {
    const next = attempt + 1;
    const toDlq = isPermanent(error) || next > MAX_TOPIC_RETRIES;
    const original = record.headers['x-original-topic'] ?? record.topic;
    await this.publish([
      {
        topic: `${original}.${toDlq ? 'dlq' : 'retry'}`,
        key: record.key,
        value: record.value,
        headers: {
          ...record.headers,
          'x-original-topic': original,
          'x-consumer-group': group,
          'x-retry-count': String(next),
          'x-retry-after': String(Date.now() + RETRY_DELAY_MS),
          'x-error': String((error as Error)?.message ?? error).slice(0, 500),
        },
      },
    ]);
    if (toDlq) metrics.kafkaDlq.inc({ topic: original });
    this.options.logger.warn({ err: error, group, topic: original, key: record.key, attempt: next }, toDlq ? 'событие отправлено в DLQ' : 'событие отложено для повтора');
  }

  private getProducer(): Promise<Producer> {
    this.producer ??= (async () => {
      const producer = this.kafka.producer({ idempotent: true, maxInFlightRequests: 1, allowAutoTopicCreation: false });
      await producer.connect();
      return producer;
    })().catch((error: unknown) => {
      this.producer = undefined;
      throw error;
    });
    return this.producer;
  }

  /** kafka_consumergroup_lag = high watermark − закоммиченный offset (по каждой партиции). */
  private async reportLag(): Promise<void> {
    this.admin ??= (async () => {
      const admin = this.kafka.admin();
      await admin.connect();
      return admin;
    })();
    const admin = await this.admin;
    for (const [group, topics] of this.groups) {
      for (const { topic, partitions } of await admin.fetchOffsets({ groupId: group, topics })) {
        const latest = await admin.fetchTopicOffsets(topic);
        for (const { partition, offset } of partitions) {
          const high = Number(latest.find((item) => item.partition === partition)?.high ?? 0);
          const committed = Number(offset);
          metrics.kafkaLag.set({ group, topic, partition: String(partition) }, committed < 0 ? high : Math.max(0, high - committed));
        }
      }
    }
  }
}

function isPermanent(error: unknown): boolean {
  if (error instanceof PermanentEventError) return true;
  const code = toAppError(error).code;
  return code === 'INVALID_ARGUMENT' || code === 'FAILED_PRECONDITION' || code === 'NOT_FOUND' || code === 'PERMISSION_DENIED';
}

function decodeHeaders(headers: IHeaders | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) result[name] = first.toString();
  }
  return result;
}

function toRecord(topic: string, message: KafkaMessage): RawRecord {
  return { topic, key: message.key?.toString() ?? '', value: message.value ?? Buffer.alloc(0), headers: decodeHeaders(message.headers) };
}
