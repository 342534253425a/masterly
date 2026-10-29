import 'reflect-metadata';
import { createErasureAck, loadConfig, runService } from '@masterly/platform';
import { z } from 'zod';
import { NotificationsModule } from './module.js';
import { grpcDirectory, HttpSmsProvider, ProviderSender, SmtpProvider, WebPushProvider, type Provider } from './providers.js';

const config = loadConfig({
  GRPC_IDENTITY: z.string().optional(),
  GRPC_CATALOG: z.string().optional(),
  PUBLIC_URL: z.string().url().default('http://localhost:3100'),
  /** smtp(s)://user:pass@host:port — Yandex Cloud Postbox в проде, Mailpit локально. */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Masterly <no-reply@masterly.ru>'),
  SMS_PROVIDER_URL: z.string().url().optional(),
  SMS_PROVIDER_TOKEN: z.string().default(''),
  /** Ключи VAPID: npx web-push generate-vapid-keys; приватный — из Lockbox. */
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:support@masterly.ru'),
});
if (!!config.VAPID_PUBLIC_KEY !== !!config.VAPID_PRIVATE_KEY) throw new Error('VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY задаются только вместе');
if (config.NODE_ENV === 'production' && (!config.SMTP_URL || !config.VAPID_PRIVATE_KEY || !config.GRPC_IDENTITY || !config.GRPC_CATALOG)) {
  throw new Error('В production нужны SMTP_URL, ключи VAPID, GRPC_IDENTITY и GRPC_CATALOG');
}

const directory = config.GRPC_IDENTITY && config.GRPC_CATALOG ? grpcDirectory({ identity: config.GRPC_IDENTITY, catalog: config.GRPC_CATALOG }) : undefined;

await runService({
  config,
  grpc: { package: 'masterly.platform.v1', protoPath: 'masterly/platform/v1/platform.proto' },
  needs: { db: true, bus: true },
  module: (resources) => {
    // Без адресной книги (identity + catalog) доставки по каналам невозможны — остаётся лента в приложении
    const providers: Partial<Record<'email' | 'sms' | 'push', Provider>> = directory
      ? {
          ...(config.SMTP_URL ? { email: new SmtpProvider(config.SMTP_URL, config.MAIL_FROM, config.PUBLIC_URL) } : {}),
          ...(config.SMS_PROVIDER_URL ? { sms: new HttpSmsProvider(config.SMS_PROVIDER_URL, config.SMS_PROVIDER_TOKEN) } : {}),
          ...(config.VAPID_PRIVATE_KEY ? { push: new WebPushProvider(resources.db!, { publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY, subject: config.VAPID_SUBJECT }, config.PUBLIC_URL) } : {}),
        }
      : {};
    resources.logger.info({ channels: Object.keys(providers) }, 'каналы доставки уведомлений');
    return NotificationsModule.register(resources, {
      sender: new ProviderSender(directory ?? { resolve: async () => null }, providers, resources.logger),
      erasureAck: createErasureAck('notifications', config.GRPC_IDENTITY),
      push: { publicKey: config.VAPID_PUBLIC_KEY },
    });
  },
});
