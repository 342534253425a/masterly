import { JwtVerifier, type AccessClaims, type AccessRole } from '@masterly/platform';
import type { Backends } from './backends.js';

export { ACCESS_COOKIE, parseCookies, REFRESH_COOKIE } from '@masterly/platform';

export type Role = AccessRole;

/** Пользователь запроса — из проверенного access-токена (подпись EdDSA по JWKS identity). */
export type Viewer = AccessClaims;

/** Проверка JWT в шлюзе: ключи — из identity (GetJwks), сама проверка — локально, без похода в identity на каждый запрос. */
export class Authenticator extends JwtVerifier {
  constructor(identity: Pick<Backends['identity'], 'getJwks'>, issuer: string) {
    super(async () => (await identity.getJwks({})).jwksJson, issuer);
  }
}

export function serializeCookie(name: string, value: string, options: { maxAgeSec: number; path?: string; secure: boolean }): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? '/'}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSec))}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(options.secure ? ['Secure'] : []),
  ].join('; ');
}
