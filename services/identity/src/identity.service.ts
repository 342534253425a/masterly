import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { maskPhone, normalizeRuPhone, uuidv7 } from '@masterly/kernel';
import { AppError, DB, enqueue, invalid, KV, LOGGER, notFound, unauthenticated, type Db, type FieldCipher, type KeyValueStore, type Logger } from '@masterly/platform';
import { identity } from '@masterly/proto';
import { SigningKeys } from './keys.js';
import { CIPHER, SETTINGS, SMS } from './tokens.js';

export interface SmsSender {
  send(phone: string, text: string): Promise<void>;
}

export interface IdentitySettings {
  issuer: string;
  /** Фиксированный код только для локальной разработки и e2e; в production запрещён. */
  otpDevCode?: string;
  accessTtlSec: number;
  refreshTtlSec: number;
  /** Срок хранения данных под обязательным хранением после удаления аккаунта (legal hold). */
  retentionDays: number;
}

interface OtpRecord {
  phoneHash: string;
  phoneEnc: string;
  codeHash: string;
  attempts: number;
  expiresAt: number;
}

interface Consents {
  analytics: boolean;
  personalization: boolean;
  marketing: boolean;
  policyVersion: number;
}

export interface UserRow {
  id: string;
  phone_enc: string | null;
  email_enc: string | null;
  name: string;
  roles: string[];
  master_id: string | null;
  city_id: string;
  status: string;
  consents: Consents;
  settings?: Record<string, unknown>;
  created_at: Date | string;
}

interface SessionRow {
  id: string;
  user_id: string;
  family_id: string;
  user_agent: string;
  ip_hash: string;
  expires_at: Date | string;
  rotated_at: Date | null;
  revoked_at: Date | null;
}

const OTP_TTL_MS = 5 * 60_000;
const RESEND_MS = 60_000;
const MAX_ATTEMPTS = 5;
const DAILY_LIMIT = 10;
const SOURCE = 'identity';
const ROLES: Record<string, identity.Role> = { client: identity.Role.ROLE_CLIENT, master: identity.Role.ROLE_MASTER, admin: identity.Role.ROLE_ADMIN };
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class IdentityService {
  private readonly keys: SigningKeys;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KV) private readonly kv: KeyValueStore,
    @Inject(CIPHER) private readonly cipher: FieldCipher,
    @Inject(SMS) private readonly sms: SmsSender,
    @Inject(SETTINGS) private readonly settings: IdentitySettings,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.keys = new SigningKeys(db, cipher);
  }

  /** Код входа: 6 цифр, 5 минут, 5 попыток, повтор не чаще раза в минуту, не больше 10 кодов в сутки на номер. */
  async requestOtp(request: identity.RequestOtpRequest): Promise<identity.RequestOtpResponse> {
    const phone = normalizeRuPhone(request.phone);
    if (!phone) throw invalid('Некорректный номер телефона', 'invalid_phone');
    const phoneHash = this.cipher.hash(phone);
    if (!(await this.kv.setIfAbsent(`otp:cooldown:${phoneHash}`, '1', RESEND_MS))) throw new AppError('RESOURCE_EXHAUSTED', 'Код уже отправлен — повторить можно через минуту', 'otp_cooldown');
    if ((await this.kv.incr(`otp:day:${phoneHash}`, 24 * 3_600_000)) > DAILY_LIMIT) throw new AppError('RESOURCE_EXHAUSTED', 'Слишком много запросов кода на этот номер', 'otp_daily_limit');

    const code = this.settings.otpDevCode ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
    const requestId = uuidv7();
    const record: OtpRecord = { phoneHash, phoneEnc: this.cipher.encrypt(phone), codeHash: this.cipher.hash(`${requestId}:${code}`), attempts: 0, expiresAt: Date.now() + OTP_TTL_MS };
    await this.kv.set(`otp:${requestId}`, JSON.stringify(record), OTP_TTL_MS);
    await this.sms.send(phone, `Masterly: код входа ${code}. Никому его не сообщайте.`);
    return { requestId, phoneMasked: maskPhone(phone), expiresInSec: OTP_TTL_MS / 1000, resendInSec: RESEND_MS / 1000 };
  }

  async verifyOtp(request: identity.VerifyOtpRequest): Promise<identity.VerifyOtpResponse> {
    const key = `otp:${request.requestId}`;
    const raw = await this.kv.get(key);
    if (!raw) throw invalid('Код истёк — запросите новый', 'otp_expired');
    const record = JSON.parse(raw.toString()) as OtpRecord;
    if (record.attempts >= MAX_ATTEMPTS) {
      await this.kv.del([key]);
      throw new AppError('RESOURCE_EXHAUSTED', 'Превышено число попыток — запросите новый код', 'otp_attempts');
    }
    const expected = Buffer.from(record.codeHash);
    const actual = Buffer.from(this.cipher.hash(`${request.requestId}:${request.code.trim()}`));
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      record.attempts++;
      await this.kv.set(key, JSON.stringify(record), Math.max(1, record.expiresAt - Date.now()));
      throw invalid('Неверный код', 'otp_invalid');
    }
    await this.kv.del([key]);

    await this.db.query('INSERT INTO users (id, phone_enc, phone_hash) VALUES ($1, $2, $3) ON CONFLICT (phone_hash) DO NOTHING', [uuidv7(), record.phoneEnc, record.phoneHash]);
    const user = (await this.db.query<UserRow>("SELECT * FROM users WHERE phone_hash = $1 AND status = 'active'", [record.phoneHash])).rows[0];
    if (!user) throw unauthenticated('Аккаунт недоступен');
    return { user: this.toUser(user), tokens: await this.issue(user, uuidv7(), request.userAgent, request.ipHash) };
  }

  /**
   * Ротация refresh-токена: каждый токен одноразовый. Повторное предъявление уже обменянного токена означает кражу —
   * отзывается всё семейство сессий этого входа.
   */
  async refresh(refreshToken: string): Promise<identity.TokenPair> {
    const outcome = await this.db.transaction(async (tx) => {
      const session = (await tx.query<SessionRow>('SELECT * FROM sessions WHERE refresh_hash = $1 FOR UPDATE', [sha256(refreshToken)])).rows[0];
      if (!session || session.revoked_at) return { kind: 'invalid' as const };
      if (session.rotated_at) {
        await tx.query('UPDATE sessions SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [session.family_id]);
        return { kind: 'reused' as const, userId: session.user_id };
      }
      if (new Date(session.expires_at).getTime() < Date.now()) return { kind: 'expired' as const };
      await tx.query('UPDATE sessions SET rotated_at = now() WHERE id = $1', [session.id]);
      return { kind: 'ok' as const, session };
    });
    if (outcome.kind === 'reused') {
      this.logger.warn({ userId: outcome.userId }, 'повторное использование refresh-токена: сессии входа отозваны');
      throw new AppError('UNAUTHENTICATED', 'Сессия отозвана из соображений безопасности — войдите снова', 'refresh_reused');
    }
    if (outcome.kind === 'expired') throw new AppError('UNAUTHENTICATED', 'Сессия истекла', 'refresh_expired');
    if (outcome.kind === 'invalid') throw unauthenticated('Сессия не найдена');
    const user = await this.findActive(outcome.session.user_id);
    return this.issue(user, outcome.session.family_id, outcome.session.user_agent, outcome.session.ip_hash);
  }

  async revoke(refreshToken: string, allDevices: boolean): Promise<void> {
    const session = (await this.db.query<SessionRow>('SELECT * FROM sessions WHERE refresh_hash = $1', [sha256(refreshToken)])).rows[0];
    if (!session) return;
    if (allDevices) await this.db.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [session.user_id]);
    else await this.db.query('UPDATE sessions SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [session.family_id]);
  }

  async getUser(userId: string): Promise<identity.User> {
    const user = (await this.db.query<UserRow>('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
    if (!user) throw notFound('Пользователь не найден');
    return this.toUser(user);
  }

  async jwks(): Promise<string> {
    return JSON.stringify(await this.keys.jwks());
  }

  /**
   * Удаление аккаунта: вход и сессии закрываются сразу, номер освобождается, публичные ПДн стираются,
   * событие AccountDeletionRequested поручает сервисам-владельцам удалить свои данные (ADR-0011).
   */
  async deleteAccount(userId: string): Promise<string> {
    const retainUntil = new Date(Date.now() + this.settings.retentionDays * 86_400_000).toISOString();
    await this.db.transaction(async (tx) => {
      const user = (await tx.query<UserRow>("SELECT * FROM users WHERE id = $1 AND status = 'active' FOR UPDATE", [userId])).rows[0];
      if (!user) throw notFound('Пользователь не найден');
      await tx.query(
        "UPDATE users SET status = 'deleted', name = '', email_enc = NULL, email_hash = NULL, phone_hash = 'deleted:' || id::text, deleted_at = now(), retain_until = $2 WHERE id = $1",
        [userId, retainUntil],
      );
      await tx.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
      await tx.query('DELETE FROM favorites WHERE user_id = $1', [userId]);
      await tx.query("UPDATE users SET settings = '{}' WHERE id = $1", [userId]);
      await enqueue(tx, SOURCE, [
        { type: 'identity.account.deletion_requested.v1', key: userId, payload: { userId, requestedAt: new Date().toISOString(), retainUntil, roles: user.roles.map((role) => ROLES[role] ?? identity.Role.ROLE_CLIENT) } },
      ]);
    });
    return retainUntil;
  }

  async updateConsents(userId: string, next: identity.Consents): Promise<identity.Consents> {
    return this.db.transaction(async (tx) => {
      const user = (await tx.query<UserRow>("SELECT * FROM users WHERE id = $1 AND status = 'active' FOR UPDATE", [userId])).rows[0];
      if (!user) throw notFound('Пользователь не найден');
      const consents: Consents = { analytics: next.analytics, personalization: next.personalization, marketing: next.marketing, policyVersion: next.policyVersion || user.consents.policyVersion };
      for (const purpose of ['analytics', 'personalization', 'marketing'] as const) {
        if (user.consents[purpose] !== consents[purpose]) {
          await tx.query('INSERT INTO consent_log (user_id, purpose, granted, policy_version) VALUES ($1, $2, $3, $4)', [userId, purpose, consents[purpose], consents.policyVersion]);
        }
      }
      await tx.query('UPDATE users SET consents = $2 WHERE id = $1', [userId, JSON.stringify(consents)]);
      await enqueue(tx, SOURCE, [{ type: 'identity.account.consent_changed.v1', key: userId, payload: { userId, ...consents, at: new Date().toISOString() } }]);
      return consents;
    });
  }

  async acknowledgeErasure(userId: string, service: string): Promise<void> {
    await this.db.query('INSERT INTO erasure_acks (user_id, service) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, service]);
  }

  async userSettings(userId: string): Promise<identity.GetSettingsResponse> {
    const user = await this.findActive(userId);
    return { settingsJson: JSON.stringify(user.settings ?? {}), cityId: user.city_id, consents: user.consents };
  }

  /** Настройки интерфейса — неглубокое слияние JSON-объекта; город по умолчанию попадает и в токен (claim city). */
  async updateSettings(userId: string, settingsJson: string, cityId: string): Promise<identity.UpdateSettingsResponse> {
    let patch: Record<string, unknown> = {};
    if (settingsJson) {
      if (settingsJson.length > 16_384) throw invalid('Слишком большие настройки', 'settings_too_large');
      const parsed: unknown = JSON.parse(settingsJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw invalid('Настройки — JSON-объект', 'settings_invalid');
      patch = parsed as Record<string, unknown>;
    }
    const { rows } = await this.db.query<UserRow>(
      "UPDATE users SET settings = settings || $2::jsonb, city_id = CASE WHEN $3 = '' THEN city_id ELSE $3 END WHERE id = $1 AND status = 'active' RETURNING *",
      [userId, JSON.stringify(patch), cityId],
    );
    if (!rows[0]) throw notFound('Пользователь не найден');
    return { settingsJson: JSON.stringify(rows[0].settings ?? {}), cityId: rows[0].city_id };
  }

  async favorites(userId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ master_id: string }>('SELECT master_id FROM favorites WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200', [userId]);
    return rows.map((row) => row.master_id);
  }

  async addFavorite(userId: string, masterId: string): Promise<void> {
    const count = await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM favorites WHERE user_id = $1', [userId]);
    if (count.rows[0]!.n >= 200) throw new AppError('RESOURCE_EXHAUSTED', 'В избранном не больше 200 мастеров', 'favorites_limit');
    await this.db.query('INSERT INTO favorites (user_id, master_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, masterId]);
  }

  async removeFavorite(userId: string, masterId: string): Promise<void> {
    await this.db.query('DELETE FROM favorites WHERE user_id = $1 AND master_id = $2', [userId, masterId]);
  }

  async consentLog(userId: string): Promise<identity.ConsentEntry[]> {
    const { rows } = await this.db.query<{ purpose: string; granted: boolean; at: Date }>('SELECT purpose, granted, at FROM consent_log WHERE user_id = $1 ORDER BY at', [userId]);
    return rows.map((row) => ({ purpose: row.purpose, granted: row.granted, at: new Date(row.at).toISOString() }));
  }

  /** Поиск в админке: номер телефона (по HMAC), id или префикс имени — каждый вариант опирается на индекс. */
  async listUsers(query: string, limit: number): Promise<identity.AdminUser[]> {
    const take = Math.min(Math.max(limit || 50, 1), 100);
    const text = query.trim();
    const phone = text ? normalizeRuPhone(text) : null;
    const select = `SELECT u.*, (SELECT max(greatest(s.created_at, coalesce(s.rotated_at, s.created_at))) FROM sessions s WHERE s.user_id = u.id) AS last_seen FROM users u`;
    const { rows } = phone
      ? await this.db.query<UserRow & { last_seen: Date | null }>(`${select} WHERE u.phone_hash = $1`, [this.cipher.hash(phone)])
      : /^[0-9a-f-]{36}$/i.test(text)
        ? await this.db.query<UserRow & { last_seen: Date | null }>(`${select} WHERE u.id = $1`, [text])
        : text
          ? await this.db.query<UserRow & { last_seen: Date | null }>(`${select} WHERE lower(u.name) LIKE $1 ORDER BY lower(u.name) LIMIT ${take}`, [`${text.toLowerCase().replace(/[%_\\]/g, '')}%`])
          : await this.db.query<UserRow & { last_seen: Date | null }>(`${select} WHERE u.status <> 'deleted' ORDER BY u.created_at DESC LIMIT ${take}`);
    return rows.map((row) => ({ user: this.toUser(row), lastSeenAt: new Date(row.last_seen ?? row.created_at).toISOString() }));
  }

  /** Роли и блокировка. Блокировка сразу закрывает все сессии; вход по коду заблокированному недоступен. */
  async updateUser(userId: string, roles: identity.Role[], status: string): Promise<identity.AdminUser> {
    const names = roles.map((role) => Object.entries(ROLES).find(([, value]) => value === role)?.[0]).filter((role): role is string => !!role);
    if (roles.length && names.length !== roles.length) throw invalid('Неизвестная роль', 'invalid_role');
    if (status && status !== 'active' && status !== 'blocked') throw invalid('Статус: active или blocked', 'invalid_status');
    await this.db.transaction(async (tx) => {
      const updated = await tx.query(
        "UPDATE users SET roles = CASE WHEN cardinality($2::text[]) = 0 THEN roles ELSE $2::text[] END, status = CASE WHEN $3 = '' THEN status ELSE $3 END WHERE id = $1 AND status <> 'deleted'",
        [userId, names, status],
      );
      if (updated.rowCount === 0) throw notFound('Пользователь не найден');
      if (status === 'blocked') await tx.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    });
    return (await this.listUsers(userId, 1))[0]!;
  }

  /** Адрес доставки уведомлений — только для сервиса notifications (наружу шлюз эти данные не отдаёт). */
  async contacts(userId: string): Promise<identity.GetUserContactsResponse> {
    const user = await this.findActive(userId);
    return { email: user.email_enc ? this.cipher.decrypt(user.email_enc) : '', phone: user.phone_enc ? this.cipher.decrypt(user.phone_enc) : '', name: user.name };
  }

  private async findActive(userId: string): Promise<UserRow> {
    const user = (await this.db.query<UserRow>("SELECT * FROM users WHERE id = $1 AND status = 'active'", [userId])).rows[0];
    if (!user) throw unauthenticated('Аккаунт недоступен');
    return user;
  }

  /** Новая пара токенов: refresh хранится только хэшем, access — JWT EdDSA на 15 минут. */
  private async issue(user: UserRow, familyId: string, userAgent = '', ipHash = ''): Promise<identity.TokenPair> {
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = Date.now() + this.settings.refreshTtlSec * 1000;
    await this.db.query('INSERT INTO sessions (id, user_id, family_id, refresh_hash, user_agent, ip_hash, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      uuidv7(), user.id, familyId, sha256(refreshToken), userAgent.slice(0, 200), ipHash, new Date(refreshExpiresAt),
    ]);
    const access = await this.keys.sign({ roles: user.roles, mid: user.master_id ?? undefined, name: user.name || undefined, city: user.city_id }, user.id, {
      issuer: this.settings.issuer,
      ttlSec: this.settings.accessTtlSec,
    });
    return { accessToken: access.token, refreshToken, accessExpiresAt: access.expiresAt, refreshExpiresAt };
  }

  private toUser(row: UserRow): identity.User {
    return {
      id: row.id,
      name: row.name,
      phoneMasked: row.phone_enc && row.status === 'active' ? maskPhone(this.cipher.decrypt(row.phone_enc)) : '',
      email: row.email_enc ? this.cipher.decrypt(row.email_enc) : '',
      roles: row.roles.map((role) => ROLES[role] ?? identity.Role.ROLE_CLIENT),
      masterId: row.master_id ?? '',
      cityId: row.city_id,
      createdAt: new Date(row.created_at).toISOString(),
      status: row.status,
      consents: row.consents,
    };
  }
}
