import { AsyncLocalStorage } from 'node:async_hooks';

/** Контекст запроса, который проходит через всю цепочку вызовов: дедлайн и личность пользователя. */
export interface RequestContext {
  /** Абсолютный дедлайн (мс с эпохи). Нижестоящие вызовы получают остаток, а не свой «полный» таймаут. */
  deadline?: number;
  userId?: string;
  roles?: string[];
}

const storage = new AsyncLocalStorage<RequestContext>();

export function currentContext(): RequestContext {
  return storage.getStore() ?? {};
}

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Устанавливает контекст для текущей асинхронной цепочки (используется в интерсепторе NestJS). */
export function enterContext(context: RequestContext): void {
  storage.enterWith(context);
}

/** Сколько миллисекунд осталось до дедлайна (undefined — дедлайна нет). */
export function remainingMs(context: RequestContext = currentContext()): number | undefined {
  return context.deadline === undefined ? undefined : context.deadline - Date.now();
}
