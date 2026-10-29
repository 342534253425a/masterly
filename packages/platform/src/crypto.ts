import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/** Ключ только для локальной разработки и тестов. В проде сервис не стартует с ним (assertProductionSecret). */
export const DEV_FIELD_KEY = Buffer.alloc(32, 7).toString('base64');

export interface FieldCipher {
  /** AES-256-GCM: «v1.» + base64url(iv | tag | ciphertext). */
  encrypt(plain: string): string;
  decrypt(token: string): string;
  /** Детерминированный HMAC-SHA256 (hex): поиск и дедупликация без расшифровки. */
  hash(value: string): string;
}

/**
 * Шифрование ПДн на уровне приложения (телефон, email): дамп БД без ключа контакты не раскрывает.
 * Ключи приходят из Lockbox через External Secrets; конвертная схема с KMS — этап 2 (docs/architecture/security-privacy.md#5-шифрование).
 */
export function createFieldCipher(keyBase64: string, hmacKeyBase64: string = keyBase64): FieldCipher {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('Ключ шифрования полей должен быть 32 байта в base64');
  const hmacKey = Buffer.from(hmacKeyBase64, 'base64');
  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return `v1.${Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url')}`;
    },
    decrypt(token) {
      if (!token.startsWith('v1.')) throw new Error('Неизвестный формат шифртекста');
      const raw = Buffer.from(token.slice(3), 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    },
    hash(value) {
      return createHmac('sha256', hmacKey).update(value).digest('hex');
    },
  };
}

/** В проде запрещены ключи разработки: ошибка конфигурации — падение на старте. */
export function assertProductionSecret(nodeEnv: string, name: string, value: string): void {
  if (nodeEnv === 'production' && value === DEV_FIELD_KEY) throw new Error(`${name}: в production нельзя использовать ключ разработки`);
}
