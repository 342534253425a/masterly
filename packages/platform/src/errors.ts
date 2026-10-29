import { Metadata, status } from '@grpc/grpc-js';
import { BrokenCircuitError, TaskCancelledError } from 'cockatiel';

export type ErrorCode =
  | 'INVALID_ARGUMENT'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'PERMISSION_DENIED'
  | 'UNAUTHENTICATED'
  | 'FAILED_PRECONDITION'
  | 'ABORTED'
  | 'RESOURCE_EXHAUSTED'
  | 'DEADLINE_EXCEEDED'
  | 'UNAVAILABLE'
  | 'INTERNAL';

/**
 * Доменная ошибка. Код переводится в статус gRPC внутри и в HTTP + problem+json на шлюзе;
 * `reason` — машинно-читаемая причина для клиента (например, `contacts_chat_only`).
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly reason?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const invalid = (message: string, reason?: string) => new AppError('INVALID_ARGUMENT', message, reason);
export const notFound = (message: string) => new AppError('NOT_FOUND', message, 'not_found');
export const conflict = (message: string, reason?: string) => new AppError('FAILED_PRECONDITION', message, reason);
export const forbidden = (message = 'Недостаточно прав') => new AppError('PERMISSION_DENIED', message, 'forbidden');
export const unauthenticated = (message = 'Требуется вход') => new AppError('UNAUTHENTICATED', message, 'unauthenticated');

const TO_GRPC: Record<ErrorCode, status> = {
  INVALID_ARGUMENT: status.INVALID_ARGUMENT,
  NOT_FOUND: status.NOT_FOUND,
  ALREADY_EXISTS: status.ALREADY_EXISTS,
  PERMISSION_DENIED: status.PERMISSION_DENIED,
  UNAUTHENTICATED: status.UNAUTHENTICATED,
  FAILED_PRECONDITION: status.FAILED_PRECONDITION,
  ABORTED: status.ABORTED,
  RESOURCE_EXHAUSTED: status.RESOURCE_EXHAUSTED,
  DEADLINE_EXCEEDED: status.DEADLINE_EXCEEDED,
  UNAVAILABLE: status.UNAVAILABLE,
  INTERNAL: status.INTERNAL,
};

export const HTTP_STATUS: Record<ErrorCode, number> = {
  INVALID_ARGUMENT: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  FAILED_PRECONDITION: 409,
  ABORTED: 409,
  RESOURCE_EXHAUSTED: 429,
  INTERNAL: 500,
  UNAVAILABLE: 503,
  DEADLINE_EXCEEDED: 504,
};

export function grpcStatusOf(code: ErrorCode): status {
  return TO_GRPC[code];
}

/** Любая ошибка → AppError (неизвестные — INTERNAL без утечки деталей наружу). */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof BrokenCircuitError) return new AppError('UNAVAILABLE', 'Зависимость временно недоступна', 'circuit_open');
  if (error instanceof TaskCancelledError) return new AppError('DEADLINE_EXCEEDED', 'Превышено время ожидания', 'timeout');
  if (isGrpcError(error)) return fromGrpcError(error);
  if (error && typeof error === 'object' && 'issues' in error) return new AppError('INVALID_ARGUMENT', 'Некорректные данные', 'validation');
  // Класс 22 SQLSTATE (битый UUID из адреса, дата, переполнение числа) — некорректный ввод клиента, а не сбой сервиса
  if (isPgDataException(error)) return new AppError('INVALID_ARGUMENT', 'Некорректный идентификатор или значение', 'invalid_value');
  return new AppError('INTERNAL', 'Внутренняя ошибка');
}

function isPgDataException(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^22[0-9A-Z]{3}$/.test(code);
}

interface GrpcLikeError {
  code: number;
  details?: string;
  message: string;
  metadata?: Metadata;
}

function isGrpcError(error: unknown): error is GrpcLikeError {
  return !!error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'number' && 'metadata' in error;
}

export function fromGrpcError(error: GrpcLikeError): AppError {
  const entry = Object.entries(TO_GRPC).find(([, value]) => value === error.code);
  const code = (entry?.[0] as ErrorCode | undefined) ?? (error.code === status.CANCELLED ? 'UNAVAILABLE' : 'INTERNAL');
  const reason = error.metadata?.get('x-reason')[0]?.toString();
  return new AppError(code, error.details || error.message, reason);
}

/** Объект ошибки для grpc-js: код, текст и причина в trailing-метаданных. */
export function toGrpcError(error: AppError): { code: status; message: string; details: string; metadata: Metadata } {
  const metadata = new Metadata();
  if (error.reason) metadata.set('x-reason', error.reason);
  return { code: TO_GRPC[error.code], message: error.message, details: error.message, metadata };
}

/** Временная ошибка: имеет смысл повторить (с бюджетом) или отложить. */
export function isTransient(error: unknown): boolean {
  const code = toAppError(error).code;
  return code === 'UNAVAILABLE' || code === 'DEADLINE_EXCEEDED' || code === 'ABORTED' || isNetworkError(error);
}

function isNetworkError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', '40001', '40P01', '55P03'].includes(code);
}
