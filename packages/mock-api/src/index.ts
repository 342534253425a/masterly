import { getResponse, type RequestHandler } from 'msw';
import { adminHandlers } from './handlers/admin.js';
import { cabinetHandlers } from './handlers/cabinet.js';
import { publicHandlers } from './handlers/public.js';
import { userHandlers } from './handlers/user.js';
import { problem } from './http.js';

export const handlers: RequestHandler[] = [...publicHandlers, ...userHandlers, ...cabinetHandlers, ...adminHandlers];

/**
 * Обработка запроса без перехвата сети: тот же набор MSW-хендлеров работает
 * в Next.js Route Handler (демо-режим), в RSC при SSR, в Storybook и в тестах.
 */
export async function handleMockRequest(request: Request): Promise<Response> {
  const response = await getResponse(handlers, request);
  return response ?? problem(404, 'Маршрут не найден', 'route_not_found');
}

export { resetDb } from './db.js';
