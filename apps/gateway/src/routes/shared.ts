import type { catalog, leads } from '@masterly/proto';
import type { Backends } from '../backends.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../auth.js';
import type { HandlerContext } from '../http.js';

/** Гидратация карточек: один пакетный вызов catalog на каждые 100 мастеров (catalog держит их в кэше). */
export async function mastersById(backends: Backends, ids: Iterable<string>): Promise<Map<string, catalog.Master>> {
  const unique = [...new Set([...ids].filter(Boolean))];
  const result = new Map<string, catalog.Master>();
  for (let start = 0; start < unique.length; start += 100) {
    const { masters } = await backends.catalog.batchGetMasters({ ids: unique.slice(start, start + 100) });
    for (const master of masters) result.set(master.id, master);
  }
  return result;
}

export const mastersOfLead = (lead: leads.Lead) => [lead.acceptedMasterId, ...lead.recipients.map((r) => r.masterId), ...lead.responses.map((r) => r.masterId)];

/** Access-токен — короткая cookie, refresh — длинная; обе HttpOnly, SameSite=Lax, Secure в проде. */
export function setTokens(ctx: HandlerContext, tokens: { accessToken: string; refreshToken: string; accessExpiresAt: number; refreshExpiresAt: number }): void {
  ctx.setCookie(ACCESS_COOKIE, tokens.accessToken, { maxAgeSec: (tokens.accessExpiresAt - Date.now()) / 1000 });
  ctx.setCookie(REFRESH_COOKIE, tokens.refreshToken, { maxAgeSec: (tokens.refreshExpiresAt - Date.now()) / 1000 });
}

export function clearTokens(ctx: HandlerContext): void {
  ctx.setCookie(ACCESS_COOKIE, '', { maxAgeSec: 0 });
  ctx.setCookie(REFRESH_COOKIE, '', { maxAgeSec: 0 });
}

/** Подпись токена уже проверил identity, выпустивший его секундой раньше, — достаточно прочитать sub. */
export function subjectOf(token: string): string {
  const payload = token.split('.')[1] ?? '';
  return (JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub?: string }).sub ?? '';
}

/** Маленький кэш в памяти пода для справочных агрегатов (счётчики мастеров, медианы цен). */
export function memo<T>(ttlMs: number, load: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const cache = new Map<string, { at: number; value: Promise<T> }>();
  return (key) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = load(key).catch((error: unknown) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, { at: Date.now(), value });
    return value;
  };
}
