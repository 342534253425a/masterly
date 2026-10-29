import 'server-only';
import type { Role } from '@masterly/contracts';
import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { cache } from 'react';
import { createApiCaller, makeQueryClient, type Transport } from '@/shared/api';
import { CITY_COOKIE, siteConfig } from '@/shared/config';
import { redirect } from '@/shared/i18n';

const API_MODE = process.env.API_MODE ?? 'mock';
const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:8080';

/**
 * Серверный транспорт для RSC: без лишнего HTTP-хопа — в демо-режиме вызывает мок-бэкенд
 * напрямую, в боевом — внутренний адрес API Gateway. Cookie пробрасываются только для
 * приватных маршрутов: публичные страницы не зависят от пользователя.
 */
const serverTransport: Transport = async (path, { withCookies, ...init }) => {
  const headers = new Headers(init.headers);
  if (withCookies) {
    const cookieHeader = (await cookies()).toString();
    if (cookieHeader) headers.set('cookie', cookieHeader);
  }
  if (API_MODE === 'mock') {
    const { handleMockRequest } = await import('@masterly/mock-api');
    return handleMockRequest(new Request(`http://masterly.internal/api${path}`, { ...init, headers }));
  }
  return fetch(`${GATEWAY_URL}${path}`, { ...init, headers, cache: 'no-store' });
};

export const serverApiCall = createApiCaller(serverTransport);

/** Один QueryClient на запрос RSC: все серверные компоненты страницы делят кэш. */
export const getServerQueryClient = cache(makeQueryClient);

/**
 * Серверная проверка доступа для приватных страниц (UX-редирект на вход).
 * Реальная авторизация — в API Gateway: RBAC по ролям из JWT + проверка владения ресурсом в сервисах.
 */
export async function requireUser(nextPath: string, role?: Role) {
  const session = await serverApiCall('session', {}, { withCookies: true }).catch(() => null);
  const locale = await getLocale();
  if (!session?.user) redirect({ href: `/login?next=${encodeURIComponent(nextPath)}`, locale });
  if (role && session?.user && !session.user.roles.includes(role)) redirect({ href: `/login?next=${encodeURIComponent(nextPath)}&role=${role}`, locale });
  return session!.user!;
}

/** Город пользователя из cookie — сервер сразу рендерит выдачу нужного города. */
export async function getServerCity(): Promise<string> {
  return (await cookies()).get(CITY_COOKIE)?.value ?? siteConfig.defaultCity;
}
