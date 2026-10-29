import { exportJWK, generateKeyPair, importJWK, SignJWT, type CryptoKey, type JWK } from 'jose';
import { uuidv7 } from '@masterly/kernel';
import type { Db, FieldCipher } from '@masterly/platform';

const ROTATE_AFTER_MS = 30 * 24 * 60 * 60_000;
const PUBLISH_RETIRED_MS = 30 * 24 * 60 * 60_000;

interface KeyRow {
  kid: string;
  public_jwk: JWK;
  private_enc: string;
  created_at: Date;
  retired_at: Date | null;
}

/**
 * Ключи подписи JWT (EdDSA / Ed25519). Активный ключ ротируется раз в 30 дней; JWKS публикует и прежний ключ,
 * пока не истекут подписанные им токены. Приватный ключ хранится зашифрованным.
 */
export class SigningKeys {
  private active?: { kid: string; key: CryptoKey; at: number };

  constructor(
    private readonly db: Db,
    private readonly cipher: FieldCipher,
  ) {}

  async sign(claims: Record<string, unknown>, subject: string, options: { issuer: string; ttlSec: number }): Promise<{ token: string; expiresAt: number }> {
    const { kid, key } = await this.current();
    const expiresAt = Math.floor(Date.now() / 1000) + options.ttlSec;
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .setIssuer(options.issuer)
      .setAudience('masterly')
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(key);
    return { token, expiresAt: expiresAt * 1000 };
  }

  async jwks(): Promise<{ keys: JWK[] }> {
    await this.current();
    const { rows } = await this.db.query<KeyRow>('SELECT * FROM signing_keys WHERE retired_at IS NULL OR retired_at > $1 ORDER BY created_at DESC', [new Date(Date.now() - PUBLISH_RETIRED_MS)]);
    return { keys: rows.map((row) => ({ ...row.public_jwk, kid: row.kid, alg: 'EdDSA', use: 'sig' })) };
  }

  private async current(): Promise<{ kid: string; key: CryptoKey }> {
    if (this.active && Date.now() - this.active.at < 60_000) return this.active;
    const row = await this.db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(7340033)');
      const { rows } = await tx.query<KeyRow>('SELECT * FROM signing_keys WHERE retired_at IS NULL ORDER BY created_at DESC LIMIT 1');
      const latest = rows[0];
      if (latest && Date.now() - new Date(latest.created_at).getTime() < ROTATE_AFTER_MS) return latest;
      const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
      const kid = uuidv7();
      const created = await tx.query<KeyRow>('INSERT INTO signing_keys (kid, public_jwk, private_enc) VALUES ($1, $2, $3) RETURNING *', [
        kid,
        await exportJWK(publicKey),
        this.cipher.encrypt(JSON.stringify(await exportJWK(privateKey))),
      ]);
      if (latest) await tx.query('UPDATE signing_keys SET retired_at = now() WHERE kid = $1', [latest.kid]);
      return created.rows[0]!;
    });
    const key = (await importJWK(JSON.parse(this.cipher.decrypt(row.private_enc)) as JWK, 'EdDSA')) as CryptoKey;
    this.active = { kid: row.kid, key, at: Date.now() };
    return this.active;
  }
}
