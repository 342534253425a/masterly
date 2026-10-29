import { isAbsolute, join } from 'node:path';
import { context, propagation } from '@opentelemetry/api';
import { uuidv7 } from '@masterly/kernel';
import { PROTO_DIR } from '@masterly/proto';
import protobufjs from 'protobufjs';
import type { Root, Type } from 'protobufjs';
import { EVENTS, isEventType, type EventPayloads, type EventType, type OutgoingEvent } from './registry.js';

/** Сообщение Kafka: тело — protobuf события, метаданные — заголовки CloudEvents 1.0 (binary mode). */
export interface RawRecord {
  topic: string;
  key: string;
  value: Uint8Array;
  headers: Record<string, string>;
}

let root: Root | undefined;

function messageType(name: string): Type {
  if (!root) {
    root = new protobufjs.Root();
    root.resolvePath = (_origin, target) => (isAbsolute(target) ? target : join(PROTO_DIR, target));
    root.loadSync('masterly/events/v1/events.proto', { keepCase: false });
    root.resolveAll();
  }
  return root.lookupType(`masterly.events.v1.${name}`);
}

export function encodeEvent<T extends EventType>(type: T, payload: EventPayloads[T]): Uint8Array {
  const message = messageType(EVENTS[type].message);
  return message.encode(message.fromObject(payload as unknown as Record<string, unknown>)).finish();
}

export function decodeEvent<T extends EventType>(type: T, bytes: Uint8Array): EventPayloads[T] {
  const message = messageType(EVENTS[type].message);
  return message.toObject(message.decode(bytes), { longs: Number, enums: String, defaults: true, arrays: true }) as EventPayloads[T];
}

export function toRecord(source: string, event: OutgoingEvent, id: string = uuidv7()): RawRecord {
  const headers: Record<string, string> = {
    ce_specversion: '1.0',
    ce_id: id,
    ce_type: event.type,
    ce_source: source,
    ce_subject: event.key,
    ce_time: new Date().toISOString(),
    'content-type': 'application/x-protobuf',
    ce_schemaversion: '1',
  };
  // traceparent/tracestate: трейс запроса продолжится в потребителе
  propagation.inject(context.active(), headers);
  return { topic: EVENTS[event.type].topic, key: event.key, value: encodeEvent(event.type, event.payload as never), headers };
}

/** Входящее событие, уже декодированное. */
export interface InboundEvent<T extends EventType = EventType> {
  id: string;
  type: T;
  topic: string;
  key: string;
  source: string;
  time: string;
  attempt: number;
  payload: EventPayloads[T];
  headers: Record<string, string>;
}

export class PermanentEventError extends Error {
  override name = 'PermanentEventError';
}

export function decodeRecord(record: RawRecord, attempt = 0): InboundEvent | undefined {
  const type = record.headers.ce_type;
  if (!type) throw new PermanentEventError('Нет заголовка ce_type');
  if (!isEventType(type)) return undefined; // tolerant reader: неизвестные типы пропускаются
  let payload: EventPayloads[EventType];
  try {
    payload = decodeEvent(type, record.value);
  } catch (error) {
    throw new PermanentEventError(`Не удалось разобрать ${type}: ${(error as Error).message}`);
  }
  return {
    id: record.headers.ce_id ?? '',
    type,
    topic: record.topic,
    key: record.key,
    source: record.headers.ce_source ?? '',
    time: record.headers.ce_time ?? '',
    attempt,
    payload,
    headers: record.headers,
  };
}
