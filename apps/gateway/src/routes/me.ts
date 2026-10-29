import { Settings as SettingsSchema } from '@masterly/contracts';
import type * as C from '@masterly/contracts';
import { cityById } from '@masterly/fixtures';
import { invalid, notFound } from '@masterly/platform';
import type { leads } from '@masterly/proto';
import * as dto from '../dto.js';
import type { HandlerContext, Handlers } from '../http.js';
import { mastersById, mastersOfLead } from './shared.js';

/** Группы настроек экрана → типы уведомлений сервиса notifications. */
const GROUPS = { leads: ['lead_new', 'lead_response', 'lead_status', 'review_request'], messages: ['message'], reviews: ['review_new'] } as const;
type Group = keyof typeof GROUPS;
/** Каналы с провайдером доставки. Telegram-бота пока нет: выбор сохраняется в настройках, но не доставляется. */
const DELIVERED = ['push', 'email', 'sms'] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const DEFAULTS: Omit<C.Settings, 'cityId' | 'consents'> = {
  locale: 'ru',
  theme: 'system',
  radiusKm: 10,
  geolocation: 'ask',
  preferredChannel: 'chat',
  notifications: { leads: ['push', 'email'], messages: ['push'], reviews: ['push'], digest: ['email'], promotions: [] },
  quietHours: { enabled: true, start: '22:00', end: '08:00' },
  accessibility: { reducedMotion: false, largeText: false, highContrast: false },
  savedFilters: [],
};

/** identity хранит интерфейсные настройки как JSON, не трактуя их: при чтении каждое поле проверяется схемой контракта. */
function uiSettings(json: string): Partial<C.Settings> {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(json || '{}') as Record<string, unknown>;
  } catch {
    // Повреждённый JSON — значения по умолчанию, а не ошибка экрана
  }
  return Object.fromEntries(
    Object.entries(SettingsSchema.shape).flatMap(([key, schema]) => {
      const parsed = raw[key] === undefined ? undefined : schema.safeParse(raw[key]);
      return parsed?.success ? [[key, parsed.data]] : [];
    }),
  ) as Partial<C.Settings>;
}

/** Настройки собираются из трёх источников: интерфейс и согласия — identity, каналы и тихие часы — notifications. */
async function readSettings(ctx: HandlerContext): Promise<C.Settings> {
  const userId = ctx.user().userId;
  const [stored, preferences] = await Promise.all([
    ctx.backends.identity.getSettings({ userId }),
    ctx.backends.notifications.getPreferences({ context: ctx.rpc() }).then((response) => response.preferences).catch(() => undefined),
  ]);
  const ui = uiSettings(stored.settingsJson);
  const notifications = { ...DEFAULTS.notifications, ...ui.notifications };
  if (preferences) {
    for (const group of Object.keys(GROUPS) as Group[]) {
      const delivered = new Set(GROUPS[group].flatMap((kind) => preferences.events[kind]?.channels ?? []));
      notifications[group] = [...DELIVERED.filter((channel) => delivered.has(channel)), ...(notifications[group].includes('telegram') ? (['telegram'] as const) : [])];
    }
  }
  return {
    ...DEFAULTS,
    ...ui,
    cityId: stored.cityId || 'msk',
    notifications,
    quietHours: preferences ? { enabled: preferences.quietHoursEnabled, start: preferences.quietStart, end: preferences.quietEnd } : (ui.quietHours ?? DEFAULTS.quietHours),
    consents: { analytics: stored.consents?.analytics ?? false, personalization: stored.consents?.personalization ?? false, marketing: stored.consents?.marketing ?? false },
  };
}

/** Экспорт включает все заявки пользователя — постранично, не больше 1000. */
async function allClientLeads(ctx: HandlerContext): Promise<leads.Lead[]> {
  const result: leads.Lead[] = [];
  let cursor = '';
  for (let page = 0; page < 20; page++) {
    const response = await ctx.backends.leads.listClientLeads({ context: ctx.rpc('client'), page: { cursor, limit: 50 } });
    result.push(...response.leads);
    cursor = response.page?.nextCursor ?? '';
    if (!cursor) break;
  }
  return result;
}

export const meHandlers: Handlers = {
  settings: readSettings,

  async updateSettings(ctx) {
    const { cityId, consents, quietHours, notifications, ...rest } = ctx.body as C.UpdateSettings;
    const userId = ctx.user().userId;
    // Всё проверяем до первой записи: настройки сохраняются в двух сервисах
    if (cityId !== undefined && !cityById.has(cityId)) throw invalid('Неизвестный город', 'unknown_city');
    if (quietHours && (!HHMM.test(quietHours.start) || !HHMM.test(quietHours.end))) throw invalid('Тихие часы в формате ЧЧ:ММ', 'invalid_quiet_hours');

    const ui = { ...rest, ...(notifications ? { notifications } : {}), ...(quietHours ? { quietHours } : {}) };
    if (Object.keys(ui).length > 0 || cityId) await ctx.backends.identity.updateSettings({ userId, settingsJson: JSON.stringify(ui), cityId: cityId ?? '' });
    // Изменение согласий логируется в identity (152-ФЗ) и рассылается событием: аналитика удаляет данные при отзыве
    if (consents) await ctx.backends.identity.updateConsents({ userId, consents: { ...consents, policyVersion: 0 } });
    if (notifications || quietHours || cityId) {
      const { preferences: current } = await ctx.backends.notifications.getPreferences({ context: ctx.rpc() });
      const events = { ...current!.events };
      for (const group of Object.keys(GROUPS) as Group[]) {
        const selected = notifications?.[group];
        if (selected) for (const kind of GROUPS[group]) events[kind] = { channels: ['in_app', ...DELIVERED.filter((channel) => selected.includes(channel))] };
      }
      await ctx.backends.notifications.updatePreferences({
        context: ctx.rpc(),
        preferences: {
          events,
          quietHoursEnabled: quietHours?.enabled ?? current!.quietHoursEnabled,
          quietStart: quietHours?.start ?? current!.quietStart,
          quietEnd: quietHours?.end ?? current!.quietEnd,
          timezone: cityId ? dto.timezoneOf(cityId) : current!.timezone,
        },
      });
    }
    return readSettings(ctx);
  },

  async favorites(ctx) {
    const { masterIds } = await ctx.backends.identity.listFavorites({ userId: ctx.user().userId });
    const masters = await mastersById(ctx.backends, masterIds);
    return masterIds.flatMap((id) => {
      const master = masters.get(id);
      return master ? [dto.masterCard(master, { promoted: false })] : [];
    });
  },

  async addFavorite(ctx) {
    const { master } = await ctx.backends.catalog.getMaster({ id: ctx.params.id! });
    if (!master) throw notFound('Мастер не найден');
    await ctx.backends.identity.addFavorite({ userId: ctx.user().userId, masterId: master.id });
    return { ok: true as const };
  },

  async removeFavorite(ctx) {
    await ctx.backends.identity.removeFavorite({ userId: ctx.user().userId, masterId: ctx.params.id! });
    return { ok: true as const };
  },

  /** Экспорт ПДн по 152-ФЗ (ст. 14): синхронно, из сервисов-владельцев данных. Лимит — 3 выгрузки в сутки. */
  async exportData(ctx) {
    const userId = ctx.user().userId;
    const [{ user }, settings, { masterIds }, ownLeads, { reviews }, { entries }] = await Promise.all([
      ctx.backends.identity.getUser({ userId }),
      readSettings(ctx),
      ctx.backends.identity.listFavorites({ userId }),
      allClientLeads(ctx),
      ctx.backends.reviews.listAuthorReviews({ authorId: userId }),
      ctx.backends.identity.getConsentLog({ userId }),
    ]);
    const masters = await mastersById(ctx.backends, ownLeads.flatMap(mastersOfLead));
    return {
      exportedAt: new Date().toISOString(),
      format: 'masterly.personal-data.v1',
      user: dto.user(user!),
      settings,
      favorites: masterIds,
      leads: ownLeads.map((lead) => dto.lead(lead, masters)),
      reviews: reviews.map(dto.review),
      consentLog: entries.map((entry) => ({ consent: entry.purpose, granted: entry.granted, at: entry.at })),
    } satisfies C.DataExport;
  },

  /** Жалоба уходит в очередь модерации trust; повтор от того же пользователя за сутки не плодит записи. */
  async createReport(ctx) {
    const body = ctx.body as C.CreateReport;
    const { id } = await ctx.backends.trust.createReport({ context: ctx.rpc(), subjectType: body.subjectType, subjectId: body.subjectId, reason: body.reason, note: body.note ?? '' });
    return { id };
  },

  async pushSubscribe(ctx) {
    const body = ctx.body as { endpoint: string; keys: { p256dh: string; auth: string } };
    await ctx.backends.notifications.registerPushSubscription({ context: ctx.rpc(), endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent: String(ctx.headers['user-agent'] ?? '') });
    return { ok: true as const };
  },

  async pushUnsubscribe(ctx) {
    await ctx.backends.notifications.unregisterPushSubscription({ context: ctx.rpc(), endpoint: String(ctx.query.endpoint) });
    return { ok: true as const };
  },
};
