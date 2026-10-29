import type { Problem } from '@masterly/contracts';

/** Ошибка API в формате RFC 9457 Problem Details. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Problem['errors'];
  readonly traceId: string | undefined;

  constructor(status: number, problem: Partial<Problem> | null) {
    super(problem?.title ?? `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = problem?.code ?? 'unknown';
    this.fieldErrors = problem?.errors;
    this.traceId = problem?.traceId;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

export function errorMessage(error: unknown, fallback = 'Что-то пошло не так. Попробуйте ещё раз'): string {
  if (isApiError(error)) return error.message;
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'Сервер отвечает слишком долго. Проверьте соединение';
  if (error instanceof TypeError) return 'Нет соединения с сервером';
  return fallback;
}
