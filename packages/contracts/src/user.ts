import { z } from 'zod';
import { DateTime, Id } from './common.js';
import { ContactChannel } from './lead.js';

export const Role = z.enum(['client', 'master', 'admin']);
export type Role = z.infer<typeof Role>;

export const User = z.object({
  id: Id,
  name: z.string(),
  initials: z.string(),
  hue: z.number().int(),
  phoneMasked: z.string(),
  email: z.string().nullable(),
  roles: z.array(Role),
  activeRole: Role,
  masterId: Id.nullable(),
  cityId: Id,
  createdAt: DateTime,
});
export type User = z.infer<typeof User>;

export const Session = z.object({ user: User.nullable(), demo: z.boolean() });
export type Session = z.infer<typeof Session>;

export const OtpRequest = z.object({ phone: z.string().min(10).max(20) });
export const OtpChallenge = z.object({
  requestId: Id,
  phoneMasked: z.string(),
  expiresInSec: z.number().int(),
  resendInSec: z.number().int(),
  /** Только в демо-режиме: код, который «пришёл бы» в SMS. */
  demoCode: z.string().nullable(),
});
export type OtpChallenge = z.infer<typeof OtpChallenge>;
export const OtpVerify = z.object({ requestId: Id, code: z.string().regex(/^\d{4,6}$/, 'Код из 4–6 цифр') });
export const DemoLogin = z.object({ role: Role });

export const NotificationChannel = z.enum(['push', 'email', 'sms', 'telegram']);
export type NotificationChannel = z.infer<typeof NotificationChannel>;

const channels = z.array(NotificationChannel);

export const Settings = z.object({
  locale: z.enum(['ru', 'en', 'zh']),
  theme: z.enum(['system', 'light', 'dark']),
  cityId: Id,
  radiusKm: z.number().int().min(1).max(50),
  geolocation: z.enum(['ask', 'allow', 'deny']),
  preferredChannel: ContactChannel,
  notifications: z.object({
    leads: channels,
    messages: channels,
    reviews: channels,
    digest: channels,
    promotions: channels,
  }),
  quietHours: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
  accessibility: z.object({ reducedMotion: z.boolean(), largeText: z.boolean(), highContrast: z.boolean() }),
  /** Согласия на обработку данных (152-ФЗ): версионируются и логируются отдельно. */
  consents: z.object({ analytics: z.boolean(), personalization: z.boolean(), marketing: z.boolean() }),
  savedFilters: z.array(z.object({ id: Id, name: z.string(), query: z.record(z.string(), z.string()), createdAt: DateTime })),
});
export type Settings = z.infer<typeof Settings>;

export const UpdateSettings = Settings.partial();
export type UpdateSettings = z.infer<typeof UpdateSettings>;

export const DataExport = z.object({
  exportedAt: DateTime,
  format: z.literal('masterly.personal-data.v1'),
  user: User,
  settings: Settings,
  favorites: z.array(Id),
  leads: z.array(z.record(z.string(), z.unknown())),
  reviews: z.array(z.record(z.string(), z.unknown())),
  consentLog: z.array(z.object({ consent: z.string(), granted: z.boolean(), at: DateTime })),
});
export type DataExport = z.infer<typeof DataExport>;

export const AccountDeletion = z.object({
  scheduledAt: DateTime,
  /** Часть данных храним дольше по закону (например, журнал обращений) — честно сообщаем об этом. */
  retained: z.array(z.object({ data: z.string(), until: DateTime, basis: z.string() })),
});
export type AccountDeletion = z.infer<typeof AccountDeletion>;
