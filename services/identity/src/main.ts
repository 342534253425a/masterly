import 'reflect-metadata';
import { assertProductionSecret, createFieldCipher, createLogger, DEV_FIELD_KEY, loadConfig, runService } from '@masterly/platform';
import { z } from 'zod';
import { HttpSmsSender, IdentityModule, LogSmsSender } from './module.js';

const config = loadConfig({
  JWT_ISSUER: z.string().default('https://id.masterly.local'),
  ACCESS_TTL_SEC: z.coerce.number().int().positive().default(900),
  REFRESH_TTL_SEC: z.coerce.number().int().positive().default(60 * 24 * 3600),
  RETENTION_DAYS: z.coerce.number().int().positive().default(3 * 365),
  OTP_DEV_CODE: z.string().regex(/^\d{4,6}$/).optional(),
  FIELD_ENCRYPTION_KEY: z.string().default(DEV_FIELD_KEY),
  PII_HMAC_KEY: z.string().default(DEV_FIELD_KEY),
  SMS_PROVIDER_URL: z.string().url().optional(),
  SMS_PROVIDER_TOKEN: z.string().default(''),
  SEED_DEMO: z.stringbool().default(false),
});
assertProductionSecret(config.NODE_ENV, 'FIELD_ENCRYPTION_KEY', config.FIELD_ENCRYPTION_KEY);
assertProductionSecret(config.NODE_ENV, 'PII_HMAC_KEY', config.PII_HMAC_KEY);
if (config.NODE_ENV === 'production' && (config.OTP_DEV_CODE || !config.SMS_PROVIDER_URL)) {
  throw new Error('В production нужен SMS_PROVIDER_URL, а OTP_DEV_CODE запрещён');
}

const logger = createLogger({ service: config.SERVICE_NAME, level: config.LOG_LEVEL });

await runService({
  config,
  grpc: { package: 'masterly.identity.v1', protoPath: 'masterly/identity/v1/identity.proto' },
  needs: { db: true, bus: true, kv: true, outbox: true },
  module: (resources) =>
    IdentityModule.register(resources, {
      cipher: createFieldCipher(config.FIELD_ENCRYPTION_KEY, config.PII_HMAC_KEY),
      sms: config.SMS_PROVIDER_URL ? new HttpSmsSender(config.SMS_PROVIDER_URL, config.SMS_PROVIDER_TOKEN) : new LogSmsSender(logger),
      settings: { issuer: config.JWT_ISSUER, otpDevCode: config.OTP_DEV_CODE, accessTtlSec: config.ACCESS_TTL_SEC, refreshTtlSec: config.REFRESH_TTL_SEC, retentionDays: config.RETENTION_DAYS },
      seedDemo: config.SEED_DEMO,
    }),
});
