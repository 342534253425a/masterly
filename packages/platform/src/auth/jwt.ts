import { createLocalJWKSet, jwtVerify, type JWTPayload } from 'jose';

export const ACCESS_COOKIE = 'mly_at';
export const REFRESH_COOKIE = 'mly_rt';

export type AccessRole = 'client' | 'master' | 'admin';

/** Пользователь из проверенного access-токена (подпись EdDSA по JWKS identity). */
export interface AccessClaims {
  userId: string;
  roles: AccessRole[];
  /** Мастерская, которой управляет пользователь (claim mid), иначе пусто. */
  masterId: string;
  name: string;
  cityId: string;
  /** Окончание действия токена, мс epoch: долгие соединения (WebSocket) закрываются к этому моменту. */
  expiresAt: number;
}

type KeySet = ReturnType<typeof createLocalJWKSet>;

/**
 * Проверка JWT локально, без похода в identity на каждый запрос: шлюз и сервер WebSocket.
 * JWKS кэшируется на 5 минут; незнакомый kid (ротация ключа) — внеочередное обновление. Если identity недоступен — работаем по кэшу.
 */
export class JwtVerifier {
  private keys?: { at: number; set: KeySet };

  constructor(
    private readonly loadJwks: () => Promise<string>,
    private readonly issuer: string,
  ) {}

  async verify(token: string): Promise<AccessClaims | null> {
    for (const force of [false, true]) {
      try {
        const { payload } = await jwtVerify(token, await this.keySet(force), { issuer: this.issuer, audience: 'masterly', algorithms: ['EdDSA'] });
        return toClaims(payload);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== 'ERR_JWKS_NO_MATCHING_KEY' || force) return null;
      }
    }
    return null;
  }

  private async keySet(force: boolean): Promise<KeySet> {
    const stale = !this.keys || Date.now() - this.keys.at > 5 * 60_000 || (force && Date.now() - this.keys.at > 10_000);
    if (stale) {
      try {
        this.keys = { at: Date.now(), set: createLocalJWKSet(JSON.parse(await this.loadJwks())) };
      } catch (error) {
        if (!this.keys) throw error;
      }
    }
    return this.keys!.set;
  }
}

function toClaims(payload: JWTPayload): AccessClaims | null {
  if (!payload.sub) return null;
  const roles = (Array.isArray(payload.roles) ? payload.roles : []).filter((role): role is AccessRole => role === 'client' || role === 'master' || role === 'admin');
  return {
    userId: payload.sub,
    roles: roles.length ? roles : ['client'],
    masterId: typeof payload.mid === 'string' ? payload.mid : '',
    name: typeof payload.name === 'string' ? payload.name : '',
    cityId: typeof payload.city === 'string' ? payload.city : 'msk',
    expiresAt: (payload.exp ?? 0) * 1000,
  };
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    try {
      result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // Битое %-кодирование в чужой cookie не должно ронять разбор остальных
    }
  }
  return result;
}
