import { z } from 'zod';
import * as A from './admin.js';
import * as Cab from './cabinet.js';
import * as Cat from './catalog.js';
import { Id, Ok, Slug } from './common.js';
import * as L from './lead.js';
import * as M from './master.js';
import * as Msg from './messaging.js';
import * as R from './review.js';
import * as S from './search.js';
import * as Seo from './seo.js';
import * as U from './user.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/** Уровень доступа проверяется в шлюзе (RBAC); сервисы дополнительно проверяют владение ресурсом. */
export type Access = 'public' | 'user' | 'master' | 'admin';

export interface RouteSpec {
  method: HttpMethod;
  path: `/v1/${string}`;
  summary: string;
  tags: readonly string[];
  access: Access;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  response: z.ZodType;
  status?: 200 | 201 | 202;
  /** CDN/edge-кэш публичных GET: s-maxage + stale-while-revalidate. */
  cache?: { sMaxAge: number; swr: number };
  /** Требует заголовок Idempotency-Key (повтор запроса не создаёт дубль). */
  idempotent?: boolean;
  rateLimit?: { limit: number; windowSec: number };
}

const route = <const T extends RouteSpec>(spec: T): T => spec;

const SlugParam = z.object({ slug: Slug });
const IdParam = z.object({ id: Id });

export const api = {
  // ── Каталог ────────────────────────────────────────────────────────────────
  cities: route({ method: 'GET', path: '/v1/cities', summary: 'Города присутствия', tags: ['catalog'], access: 'public', response: z.array(Cat.City), cache: { sMaxAge: 3600, swr: 86400 } }),
  categories: route({ method: 'GET', path: '/v1/catalog/categories', summary: 'Вертикали (категории услуг)', tags: ['catalog'], access: 'public', response: z.array(Cat.Category), cache: { sMaxAge: 3600, swr: 86400 } }),
  services: route({ method: 'GET', path: '/v1/catalog/services', summary: 'Услуги с ценовой статистикой по городу', tags: ['catalog'], access: 'public', query: z.object({ city: z.string().optional() }), response: z.array(Cat.Service), cache: { sMaxAge: 600, swr: 3600 } }),
  brands: route({ method: 'GET', path: '/v1/catalog/brands', summary: 'Бренды устройств', tags: ['catalog'], access: 'public', response: z.array(Cat.Brand), cache: { sMaxAge: 3600, swr: 86400 } }),
  models: route({ method: 'GET', path: '/v1/catalog/models', summary: 'Модели устройств', tags: ['catalog'], access: 'public', query: z.object({ brand: z.string().optional(), q: z.string().max(60).optional() }), response: z.array(Cat.DeviceModel), cache: { sMaxAge: 3600, swr: 86400 } }),

  // ── Поиск ──────────────────────────────────────────────────────────────────
  search: route({ method: 'GET', path: '/v1/search', summary: 'Поиск мастеров по проблеме, услуге и модели', tags: ['search'], access: 'public', query: S.SearchQuery, response: S.SearchResponse, cache: { sMaxAge: 15, swr: 60 }, rateLimit: { limit: 120, windowSec: 60 } }),
  suggest: route({ method: 'GET', path: '/v1/search/suggest', summary: 'Подсказки и разбор запроса на лету', tags: ['search'], access: 'public', query: z.object({ q: z.string().max(200), city: z.string().optional() }), response: S.SuggestResponse, rateLimit: { limit: 300, windowSec: 60 } }),
  mapPins: route({ method: 'GET', path: '/v1/search/map', summary: 'Пины для карты (облегчённая выдача)', tags: ['search'], access: 'public', query: S.SearchQuery, response: S.MapResponse, cache: { sMaxAge: 15, swr: 60 } }),

  // ── Мастера ────────────────────────────────────────────────────────────────
  master: route({ method: 'GET', path: '/v1/masters/{slug}', summary: 'Профиль мастера', tags: ['masters'], access: 'public', params: SlugParam, query: z.object({ service: z.string().optional(), model: z.string().optional() }), response: M.MasterProfile, cache: { sMaxAge: 60, swr: 600 } }),
  masterReviews: route({ method: 'GET', path: '/v1/masters/{id}/reviews', summary: 'Отзывы о мастере', tags: ['masters', 'reviews'], access: 'public', params: IdParam, query: R.ReviewsQuery, response: R.ReviewsPage, cache: { sMaxAge: 60, swr: 600 } }),
  similarMasters: route({ method: 'GET', path: '/v1/masters/{id}/similar', summary: 'Похожие мастера рядом', tags: ['masters'], access: 'public', params: IdParam, response: z.array(M.MasterCard) }),
  revealContacts: route({ method: 'POST', path: '/v1/masters/{id}/contacts', summary: 'Показать контакты (логируется, лимитируется)', tags: ['masters'], access: 'user', params: IdParam, response: M.ContactReveal, rateLimit: { limit: 30, windowSec: 3600 } }),
  compare: route({ method: 'GET', path: '/v1/compare', summary: 'Сравнение предложений до 4 мастеров', tags: ['masters'], access: 'public', query: Seo.CompareQuery, response: Seo.CompareResponse }),
  landing: route({ method: 'GET', path: '/v1/seo/landing', summary: 'Данные SEO-страницы «услуга в городе»', tags: ['seo'], access: 'public', query: z.object({ city: z.string(), service: z.string().optional(), model: z.string().optional() }), response: Seo.Landing, cache: { sMaxAge: 300, swr: 3600 } }),

  // ── Аутентификация ─────────────────────────────────────────────────────────
  session: route({ method: 'GET', path: '/v1/auth/session', summary: 'Текущая сессия', tags: ['auth'], access: 'public', response: U.Session }),
  otpRequest: route({ method: 'POST', path: '/v1/auth/otp', summary: 'Запросить код подтверждения', tags: ['auth'], access: 'public', body: U.OtpRequest, response: U.OtpChallenge, rateLimit: { limit: 3, windowSec: 600 } }),
  otpVerify: route({ method: 'POST', path: '/v1/auth/otp/verify', summary: 'Подтвердить код и войти', tags: ['auth'], access: 'public', body: U.OtpVerify, response: U.Session, rateLimit: { limit: 10, windowSec: 600 } }),
  demoLogin: route({ method: 'POST', path: '/v1/auth/demo', summary: 'Вход в демо-аккаунт выбранной роли', tags: ['auth'], access: 'public', body: U.DemoLogin, response: U.Session }),
  logout: route({ method: 'POST', path: '/v1/auth/logout', summary: 'Выйти', tags: ['auth'], access: 'user', response: Ok }),

  // ── Личный кабинет клиента ─────────────────────────────────────────────────
  settings: route({ method: 'GET', path: '/v1/me/settings', summary: 'Настройки', tags: ['me'], access: 'user', response: U.Settings }),
  updateSettings: route({ method: 'PATCH', path: '/v1/me/settings', summary: 'Изменить настройки', tags: ['me'], access: 'user', body: U.UpdateSettings, response: U.Settings }),
  favorites: route({ method: 'GET', path: '/v1/me/favorites', summary: 'Избранные мастера', tags: ['me'], access: 'user', response: z.array(M.MasterCard) }),
  addFavorite: route({ method: 'PUT', path: '/v1/me/favorites/{id}', summary: 'Добавить в избранное', tags: ['me'], access: 'user', params: IdParam, response: Ok }),
  removeFavorite: route({ method: 'DELETE', path: '/v1/me/favorites/{id}', summary: 'Убрать из избранного', tags: ['me'], access: 'user', params: IdParam, response: Ok }),
  notifications: route({ method: 'GET', path: '/v1/me/notifications', summary: 'Уведомления', tags: ['me'], access: 'user', response: z.array(Msg.Notification) }),
  readNotifications: route({ method: 'POST', path: '/v1/me/notifications/read', summary: 'Отметить уведомления прочитанными', tags: ['me'], access: 'user', response: Ok }),
  exportData: route({ method: 'POST', path: '/v1/me/export', summary: 'Экспорт персональных данных', tags: ['me', 'privacy'], access: 'user', response: U.DataExport, rateLimit: { limit: 3, windowSec: 86400 } }),
  deleteAccount: route({ method: 'DELETE', path: '/v1/me', summary: 'Удалить аккаунт с учётом сроков хранения', tags: ['me', 'privacy'], access: 'user', response: U.AccountDeletion }),

  // ── Заявки ─────────────────────────────────────────────────────────────────
  leads: route({ method: 'GET', path: '/v1/leads', summary: 'Мои заявки', tags: ['leads'], access: 'user', response: z.array(L.LeadSummary) }),
  lead: route({ method: 'GET', path: '/v1/leads/{id}', summary: 'Заявка', tags: ['leads'], access: 'user', params: IdParam, response: L.Lead }),
  createLead: route({ method: 'POST', path: '/v1/leads', summary: 'Создать заявку одному или нескольким мастерам', tags: ['leads'], access: 'user', body: L.CreateLead, response: L.Lead, status: 201, idempotent: true, rateLimit: { limit: 10, windowSec: 3600 } }),
  cancelLead: route({ method: 'POST', path: '/v1/leads/{id}/cancel', summary: 'Отменить заявку', tags: ['leads'], access: 'user', params: IdParam, response: L.Lead }),
  acceptResponse: route({ method: 'POST', path: '/v1/leads/{id}/responses/{responseId}/accept', summary: 'Выбрать мастера', tags: ['leads'], access: 'user', params: z.object({ id: Id, responseId: Id }), response: L.Lead }),
  completeLead: route({ method: 'POST', path: '/v1/leads/{id}/complete', summary: 'Подтвердить, что ремонт выполнен', tags: ['leads'], access: 'user', params: IdParam, response: L.Lead }),

  // ── Отзывы и жалобы ────────────────────────────────────────────────────────
  createReview: route({ method: 'POST', path: '/v1/reviews', summary: 'Оставить отзыв по завершённой заявке', tags: ['reviews'], access: 'user', body: R.CreateReview, response: R.Review, status: 201, idempotent: true }),
  createReport: route({ method: 'POST', path: '/v1/reports', summary: 'Пожаловаться', tags: ['reviews'], access: 'user', body: R.CreateReport, response: z.object({ id: Id }), status: 202, rateLimit: { limit: 20, windowSec: 3600 } }),

  // ── Сообщения ──────────────────────────────────────────────────────────────
  conversations: route({ method: 'GET', path: '/v1/conversations', summary: 'Диалоги', tags: ['messaging'], access: 'user', response: z.array(Msg.Conversation) }),
  startConversation: route({ method: 'POST', path: '/v1/conversations', summary: 'Начать диалог с мастером', tags: ['messaging'], access: 'user', body: Msg.StartConversation, response: Msg.Conversation, status: 201 }),
  messages: route({ method: 'GET', path: '/v1/conversations/{id}/messages', summary: 'Сообщения диалога', tags: ['messaging'], access: 'user', params: IdParam, query: z.object({ cursor: z.string().optional() }), response: Msg.MessagesPage }),
  sendMessage: route({ method: 'POST', path: '/v1/conversations/{id}/messages', summary: 'Отправить сообщение', tags: ['messaging'], access: 'user', params: IdParam, body: Msg.SendMessage, response: Msg.Message, status: 201, rateLimit: { limit: 60, windowSec: 60 } }),

  // ── Медиа и аналитика ──────────────────────────────────────────────────────
  createUpload: route({ method: 'POST', path: '/v1/media/uploads', summary: 'Presigned URL для загрузки фото в S3', tags: ['media'], access: 'user', body: z.object({ contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']), size: z.number().int().max(15_000_000), purpose: z.enum(['lead', 'portfolio', 'review', 'chat']) }), response: z.object({ uploadId: Id, url: z.string(), expiresAt: z.string(), headers: z.record(z.string(), z.string()) }) }),
  track: route({ method: 'POST', path: '/v1/events', summary: 'Продуктовая аналитика (beacon, только при согласии)', tags: ['analytics'], access: 'public', body: z.object({ events: z.array(z.object({ name: z.string().max(64), props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])), ts: z.number() })).max(50) }), response: Ok, status: 202 }),
  // ── Push-уведомления (PWA, Web Push с VAPID) ─────────────────────────────────
  pushConfig: route({ method: 'GET', path: '/v1/push/config', summary: 'Публичный VAPID-ключ для подписки PWA на push', tags: ['notifications'], access: 'public', response: z.object({ enabled: z.boolean(), publicKey: z.string().nullable() }), cache: { sMaxAge: 3600, swr: 86400 } }),
  pushSubscribe: route({ method: 'PUT', path: '/v1/me/push-subscription', summary: 'Подписать браузер на push-уведомления', tags: ['notifications'], access: 'user', body: z.object({ endpoint: z.url(), keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }) }), response: Ok }),
  pushUnsubscribe: route({ method: 'DELETE', path: '/v1/me/push-subscription', summary: 'Отписать браузер от push-уведомлений', tags: ['notifications'], access: 'user', query: z.object({ endpoint: z.url() }), response: Ok }),

  // ── Кабинет мастера ────────────────────────────────────────────────────────
  cabinetOverview: route({ method: 'GET', path: '/v1/cabinet/overview', summary: 'Сводка кабинета мастера', tags: ['cabinet'], access: 'master', response: Cab.CabinetOverview }),
  cabinetAnalytics: route({ method: 'GET', path: '/v1/cabinet/analytics', summary: 'Статистика эффективности размещения', tags: ['cabinet'], access: 'master', query: z.object({ period: Cab.AnalyticsPeriod.default('30d') }), response: Cab.CabinetAnalytics }),
  cabinetProfile: route({ method: 'GET', path: '/v1/cabinet/profile', summary: 'Профиль мастера для редактирования', tags: ['cabinet'], access: 'master', response: M.MasterProfile }),
  updateCabinetProfile: route({ method: 'PATCH', path: '/v1/cabinet/profile', summary: 'Изменить профиль (уходит на модерацию)', tags: ['cabinet'], access: 'master', body: Cab.UpdateProfile, response: M.MasterProfile }),
  cabinetOffers: route({ method: 'GET', path: '/v1/cabinet/offers', summary: 'Услуги и цены', tags: ['cabinet'], access: 'master', response: z.array(Cab.CabinetOffer) }),
  updateCabinetOffers: route({ method: 'PUT', path: '/v1/cabinet/offers', summary: 'Сохранить услуги и цены', tags: ['cabinet'], access: 'master', body: Cab.UpdateOffers, response: z.array(Cab.CabinetOffer) }),
  cabinetSchedule: route({ method: 'GET', path: '/v1/cabinet/schedule', summary: 'График, доступность и зона обслуживания', tags: ['cabinet'], access: 'master', response: Cab.CabinetSchedule }),
  updateCabinetSchedule: route({ method: 'PUT', path: '/v1/cabinet/schedule', summary: 'Сохранить график и зону', tags: ['cabinet'], access: 'master', body: Cab.CabinetSchedule.omit({ timezone: true }), response: Cab.CabinetSchedule }),
  cabinetLeads: route({ method: 'GET', path: '/v1/cabinet/leads', summary: 'Входящие заявки', tags: ['cabinet', 'leads'], access: 'master', response: z.array(L.CabinetLead) }),
  respondToLead: route({ method: 'POST', path: '/v1/cabinet/leads/{id}/respond', summary: 'Ответить на заявку ценой и сроком', tags: ['cabinet', 'leads'], access: 'master', params: IdParam, body: L.RespondToLead, response: L.CabinetLead, idempotent: true }),
  declineLead: route({ method: 'POST', path: '/v1/cabinet/leads/{id}/decline', summary: 'Отказаться от заявки', tags: ['cabinet', 'leads'], access: 'master', params: IdParam, body: z.object({ reason: z.string().max(300) }), response: L.CabinetLead }),
  setLeadStatus: route({ method: 'POST', path: '/v1/cabinet/leads/{id}/status', summary: 'Перевести заявку в работу / завершить', tags: ['cabinet', 'leads'], access: 'master', params: IdParam, body: z.object({ status: z.enum(['in_progress', 'completed']) }), response: L.CabinetLead }),
  cabinetReviews: route({ method: 'GET', path: '/v1/cabinet/reviews', summary: 'Отзывы о мастере', tags: ['cabinet', 'reviews'], access: 'master', response: z.array(R.Review) }),
  replyToReview: route({ method: 'POST', path: '/v1/cabinet/reviews/{id}/reply', summary: 'Ответить на отзыв', tags: ['cabinet', 'reviews'], access: 'master', params: IdParam, body: R.ReplyToReview, response: R.Review }),
  cabinetTeam: route({ method: 'GET', path: '/v1/cabinet/team', summary: 'Сотрудники и филиалы', tags: ['cabinet'], access: 'master', response: Cab.CabinetTeam }),
  inviteStaff: route({ method: 'POST', path: '/v1/cabinet/team/staff', summary: 'Пригласить сотрудника', tags: ['cabinet'], access: 'master', body: Cab.InviteStaff, response: Cab.CabinetTeam, status: 201 }),
  removeStaff: route({ method: 'DELETE', path: '/v1/cabinet/team/staff/{id}', summary: 'Удалить сотрудника', tags: ['cabinet'], access: 'master', params: IdParam, response: Cab.CabinetTeam }),
  cabinetBilling: route({ method: 'GET', path: '/v1/cabinet/billing', summary: 'Тариф, продвижение и счета', tags: ['cabinet', 'billing'], access: 'master', response: Cab.CabinetBilling }),
  requestInvoice: route({ method: 'POST', path: '/v1/cabinet/billing/invoices', summary: 'Выставить внешний счёт на оплату', tags: ['cabinet', 'billing'], access: 'master', body: Cab.RequestInvoice, response: Cab.Invoice, status: 201, idempotent: true }),

  // ── Администрирование ──────────────────────────────────────────────────────
  adminOverview: route({ method: 'GET', path: '/v1/admin/overview', summary: 'Сводка платформы', tags: ['admin'], access: 'admin', response: A.AdminOverview }),
  moderationQueue: route({ method: 'GET', path: '/v1/admin/moderation', summary: 'Очередь модерации', tags: ['admin', 'trust'], access: 'admin', query: z.object({ kind: A.ModerationKind.optional(), status: A.ModerationStatus.default('pending') }), response: z.array(A.ModerationItem) }),
  moderate: route({ method: 'POST', path: '/v1/admin/moderation/{id}/decision', summary: 'Решение модератора', tags: ['admin', 'trust'], access: 'admin', params: IdParam, body: A.ModerationDecision, response: A.ModerationItem }),
  duplicates: route({ method: 'GET', path: '/v1/admin/duplicates', summary: 'Кандидаты в дубликаты профилей', tags: ['admin', 'trust'], access: 'admin', response: z.array(A.DuplicateCandidate) }),
  resolveDuplicate: route({ method: 'POST', path: '/v1/admin/duplicates/{id}', summary: 'Объединить или отклонить дубликат', tags: ['admin', 'trust'], access: 'admin', params: IdParam, body: A.ResolveDuplicate, response: A.DuplicateCandidate }),
  adminServices: route({ method: 'GET', path: '/v1/admin/catalog/services', summary: 'Каталог услуг со статистикой', tags: ['admin', 'catalog'], access: 'admin', response: z.array(A.AdminService) }),
  updateAdminService: route({ method: 'PATCH', path: '/v1/admin/catalog/services/{id}', summary: 'Изменить услугу', tags: ['admin', 'catalog'], access: 'admin', params: IdParam, body: A.UpdateAdminService, response: A.AdminService }),
  adminCategories: route({ method: 'GET', path: '/v1/admin/catalog/categories', summary: 'Вертикали и спрос', tags: ['admin', 'catalog'], access: 'admin', response: z.array(A.AdminCategory) }),
  updateCategory: route({ method: 'PATCH', path: '/v1/admin/catalog/categories/{id}', summary: 'Запустить / скрыть вертикаль', tags: ['admin', 'catalog'], access: 'admin', params: IdParam, body: A.UpdateCategory, response: A.AdminCategory }),
  searchGaps: route({ method: 'GET', path: '/v1/admin/analytics/search-gaps', summary: 'Запросы без подходящих результатов', tags: ['admin', 'analytics'], access: 'admin', response: z.array(A.SearchGap) }),
  priceStats: route({ method: 'GET', path: '/v1/admin/analytics/prices', summary: 'Средние цены по категориям и городам', tags: ['admin', 'analytics'], access: 'admin', response: z.array(A.PriceStat) }),
  adminUsers: route({ method: 'GET', path: '/v1/admin/users', summary: 'Пользователи и роли', tags: ['admin'], access: 'admin', query: z.object({ q: z.string().max(100).optional() }), response: z.array(A.AdminUser) }),
  updateAdminUser: route({ method: 'PATCH', path: '/v1/admin/users/{id}', summary: 'Роли и блокировка', tags: ['admin'], access: 'admin', params: IdParam, body: A.UpdateAdminUser, response: A.AdminUser }),
} as const;

export type Api = typeof api;
export type RouteName = keyof Api;

export type RouteParams<T> = T extends { params: infer P extends z.ZodType } ? z.input<P> : undefined;
export type RouteQuery<T> = T extends { query: infer Q extends z.ZodType } ? Partial<z.output<Q>> : undefined;
export type RouteBody<T> = T extends { body: infer B extends z.ZodType } ? z.input<B> : undefined;
export type RouteResponse<T> = T extends { response: infer Res extends z.ZodType } ? z.output<Res> : never;

export type RouteInput<T> = (RouteParams<T> extends undefined ? { params?: undefined } : { params: RouteParams<T> }) &
  (RouteQuery<T> extends undefined ? { query?: undefined } : { query?: RouteQuery<T> }) &
  (RouteBody<T> extends undefined ? { body?: undefined } : { body: RouteBody<T> });

export function buildPath(path: string, params?: Record<string, unknown>): string {
  return path.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params?.[key];
    if (value === undefined || value === null || value === '') throw new Error(`Missing path param "${key}" for ${path}`);
    return encodeURIComponent(String(value));
  });
}

export function toQueryString(query?: Record<string, unknown>): string {
  if (!query) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const result = search.toString();
  return result ? `?${result}` : '';
}

/** Сопоставление «/v1/masters/{slug}» с реальным путём — для роутинга в шлюзе и мок-сервере. */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const keys: string[] = [];
  const regex = new RegExp(
    `^${pattern.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{(\w+)\\?\}/g, (_, key: string) => {
      keys.push(key);
      return '([^/]+)';
    })}/?$`,
  );
  const match = regex.exec(pathname);
  if (!match) return null;
  return Object.fromEntries(keys.map((key, i) => [key, decodeURIComponent(match[i + 1] ?? '')]));
}
