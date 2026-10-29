import type {
  CabinetTeam,
  ContactChannel,
  Invoice,
  LeadEvent,
  LeadStatus,
  ModerationItem,
  Notification,
  PriceRange,
  Review,
  Role,
  Settings,
  Urgency,
  VisitType,
} from '@masterly/contracts';
import { DEMO_ACCOUNTS, getMasters, MODELS, pickDemoMaster, Rng, stableId, type MasterFixture } from '@masterly/fixtures';
import { uuidv7 } from '@masterly/kernel';

export interface DbUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  roles: Role[];
  activeRole: Role;
  masterId: string | null;
  cityId: string;
  createdAt: string;
  hue: number;
  status: 'active' | 'blocked';
  lastSeenAt: string;
}

export interface DbLeadResponse {
  id: string;
  masterId: string;
  price: PriceRange | null;
  message: string;
  etaMin: number | null;
  createdAt: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface DbLead {
  id: string;
  number: string;
  clientId: string;
  cityId: string;
  serviceId: string;
  modelId: string | null;
  description: string;
  urgency: Urgency;
  visitType: VisitType;
  preferredChannel: ContactChannel;
  sharePhone: boolean;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  recipients: Array<{ masterId: string; status: LeadStatus; viewedAt: string | null; declineReason?: string }>;
  responses: DbLeadResponse[];
  timeline: LeadEvent[];
  acceptedMasterId: string | null;
  conversationId: string | null;
  reviewId: string | null;
}

export interface DbMessage {
  id: string;
  author: 'client' | 'master' | 'support' | 'system';
  kind: 'text' | 'system' | 'offer';
  text: string;
  createdAt: string;
  clientId: string | null;
}

export interface DbConversation {
  id: string;
  leadId: string | null;
  clientId: string;
  masterId: string | null;
  subject: string | null;
  messages: DbMessage[];
  readAt: { client: string; master: string };
}

export interface MockState {
  masters: MasterFixture[];
  masterById: Map<string, MasterFixture>;
  masterBySlug: Map<string, MasterFixture>;
  demoMasterId: string;
  users: Map<string, DbUser>;
  otp: Map<string, { phone: string; code: string; expiresAt: number }>;
  settings: Map<string, Settings>;
  favorites: Map<string, Set<string>>;
  leads: Map<string, DbLead>;
  leadSeq: number;
  conversations: Map<string, DbConversation>;
  notifications: Map<string, Notification[]>;
  reveals: Array<{ masterId: string; userId: string; at: string }>;
  reviewReplies: Map<string, { text: string; createdAt: string }>;
  createdReviews: Review[];
  /** Правки цен из кабинета: множитель к базовой цене мастера по услуге (ключ masterId:serviceId). */
  priceFactors: Map<string, number>;
  offerOverrides: Map<string, { durationMin: number; warrantyDays: number; parts: Array<'original' | 'oem' | 'copy'> }>;
  disabledServices: Map<string, Set<string>>;
  scheduleOverrides: Map<string, { acceptingLeads: boolean; vacation: { from: string; to: string } | null; radiusKm: number }>;
  teams: Map<string, CabinetTeam>;
  invoices: Map<string, Invoice[]>;
  moderation: Map<string, ModerationItem> | null;
  duplicateStatus: Map<string, 'open' | 'merged' | 'dismissed'>;
  serviceOverrides: Map<string, { enabled?: boolean; name?: string; description?: string }>;
  categoryStatus: Map<string, 'active' | 'soon'>;
  searchLog: Array<{ q: string; total: number; at: number }>;
  /** Idempotency-Key → id созданного ресурса (повтор POST возвращает тот же результат). */
  idempotency: Map<string, string>;
}

const hours = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const minutes = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export function defaultSettings(cityId: string): Settings {
  return {
    locale: 'ru',
    theme: 'system',
    cityId,
    radiusKm: 10,
    geolocation: 'ask',
    preferredChannel: 'chat',
    notifications: { leads: ['push', 'email'], messages: ['push'], reviews: ['push'], digest: ['email'], promotions: [] },
    quietHours: { enabled: true, start: '22:00', end: '08:00' },
    accessibility: { reducedMotion: false, largeText: false, highContrast: false },
    consents: { analytics: true, personalization: true, marketing: false },
    savedFilters: [
      {
        id: stableId('filter', 1),
        name: 'Экран iPhone рядом, открыто сейчас',
        query: { service: 'zamena-displeya', brand: 'apple', openNow: 'true' },
        createdAt: hours(24 * 9),
      },
    ],
  };
}


const CLIENT_NAMES = ['Игорь Петров', 'Мария Кузнецова', 'Тимур Алиев', 'Ольга Белова', 'Денис Орлов', 'Ксения Романова', 'Артём Гусев', 'Полина Титова', 'Егор Зайцев', 'Дарья Ильина', 'Никита Павлов', 'Виктория Белова'];

function seedUsers(state: MockState) {
  const now = new Date().toISOString();
  for (const account of Object.values(DEMO_ACCOUNTS)) {
    const roles: Role[] = account.role === 'client' ? ['client'] : ['client', account.role];
    state.users.set(account.id, {
      id: account.id,
      name: account.name,
      phone: account.phone,
      email: account.email,
      roles,
      activeRole: account.role,
      masterId: account.role === 'master' ? state.demoMasterId : null,
      cityId: account.cityId,
      createdAt: '2025-03-14T09:30:00.000Z',
      hue: account.role === 'client' ? 268 : account.role === 'master' ? 205 : 330,
      status: 'active',
      lastSeenAt: now,
    });
  }
  const rng = new Rng('clients');
  CLIENT_NAMES.forEach((name, i) => {
    const id = stableId('client', i);
    state.users.set(id, {
      id,
      name,
      phone: `+79${String(100000000 + rng.int(0, 899999999))}`,
      email: null,
      roles: ['client'],
      activeRole: 'client',
      masterId: null,
      cityId: rng.pick(['msk', 'msk', 'spb', 'krd']),
      createdAt: hours(24 * rng.int(5, 400)),
      hue: rng.int(0, 359),
      status: i === 7 ? 'blocked' : 'active',
      lastSeenAt: hours(rng.int(1, 200)),
    });
  });
}

function nextNumber(state: MockState) {
  state.leadSeq += 7;
  return `M-${state.leadSeq}`;
}

function event(type: LeadEvent['type'], at: string, actor: LeadEvent['actor'], note: string | null = null): LeadEvent {
  return { type, at, actor, note };
}

function seedLeadsAndChats(state: MockState) {
  const client = DEMO_ACCOUNTS.client.id;
  const demoMaster = state.masterById.get(state.demoMasterId)!;
  const msk = state.masters.filter((m) => m.cityId === 'msk' && !m.duplicateOf && m.id !== demoMaster.id);
  const withService = (service: string, brand: string) => msk.filter((m) => m.serviceIds.includes(service) && m.brandIds.includes(brand));
  const [m2, m3] = withService('display', 'apple');
  const batteryMasters = withService('battery', 'samsung').slice(0, 4);
  const [m5] = withService('port', 'xiaomi');

  // L1 — в работе: клиент выбрал демо-мастера (связка клиент ↔ кабинет мастера)
  const l1: DbLead = {
    id: stableId('lead', 1), number: nextNumber(state), clientId: client, cityId: 'msk', serviceId: 'display', modelId: 'iphone-13-pro',
    description: 'Уронил телефон экраном вниз, по дисплею пошли трещины и зелёная полоса справа. Сенсор работает частично.',
    urgency: 'today', visitType: 'workshop', preferredChannel: 'chat', sharePhone: true, status: 'in_progress',
    createdAt: hours(26), updatedAt: hours(2), expiresAt: hours(-46),
    recipients: [
      { masterId: demoMaster.id, status: 'in_progress', viewedAt: hours(25.6) },
      { masterId: m2!.id, status: 'declined', viewedAt: hours(25.4) },
      { masterId: m3!.id, status: 'viewed', viewedAt: hours(24.9) },
    ],
    responses: [
      { id: stableId('response', 1), masterId: demoMaster.id, price: { from: 11900, to: 15400 }, message: 'Здравствуйте! Дисплей в наличии — копия AAA за 11 900 ₽ или оригинал за 15 400 ₽. Замена 40 минут, гарантия полгода.', etaMin: 40, createdAt: hours(25.3), status: 'accepted' },
      { id: stableId('response', 2), masterId: m2!.id, price: { from: 12500, to: null }, message: 'Можем заменить сегодня после 17:00. Гарантия 3 месяца.', etaMin: 60, createdAt: hours(25.1), status: 'declined' },
    ],
    timeline: [
      event('created', hours(26), 'client'),
      event('sent', hours(26), 'system', 'Отправлено 3 мастерам рядом'),
      event('viewed', hours(25.6), 'master'),
      event('responded', hours(25.3), 'master', '11 900 – 15 400 ₽ · 40 мин'),
      event('responded', hours(25.1), 'master', '12 500 ₽ · 60 мин'),
      event('accepted', hours(24), 'client'),
      event('started', hours(2), 'master', 'Мастер приступил к замене дисплея'),
    ],
    acceptedMasterId: demoMaster.id, conversationId: stableId('conversation', 1), reviewId: null,
  };

  // L2 — получены ответы, клиент выбирает
  const l2: DbLead = {
    id: stableId('lead', 2), number: nextNumber(state), clientId: client, cityId: 'msk', serviceId: 'battery', modelId: 'galaxy-a54',
    description: 'Телефон держит заряд полдня, на холоде выключается при 30%. Хочу заменить аккумулятор.',
    urgency: 'this_week', visitType: 'courier', preferredChannel: 'chat', sharePhone: false, status: 'responded',
    createdAt: hours(3), updatedAt: minutes(35), expiresAt: hours(-69),
    recipients: batteryMasters.map((m, i) => ({ masterId: m.id, status: (i < 2 ? 'responded' : i === 2 ? 'viewed' : 'new') as LeadStatus, viewedAt: i < 3 ? hours(2.5) : null })),
    responses: batteryMasters.slice(0, 2).map((m, i) => ({
      id: stableId('response', 10 + i), masterId: m.id, price: { from: i === 0 ? 3400 : 2900, to: null },
      message: i === 0 ? 'Аккумулятор для A54 есть в наличии, замена 25 минут, гарантия 6 месяцев. Курьер заберёт сегодня.' : 'Поставим новый АКБ с калибровкой. Можем забрать курьером завтра утром.',
      etaMin: i === 0 ? 25 : 40, createdAt: minutes(i === 0 ? 70 : 35), status: 'pending' as const,
    })),
    timeline: [
      event('created', hours(3), 'client'),
      event('sent', hours(3), 'system', `Отправлено ${batteryMasters.length} мастерам рядом`),
      event('viewed', hours(2.5), 'master'),
      event('responded', minutes(70), 'master', '3 400 ₽ · 25 мин'),
      event('responded', minutes(35), 'master', '2 900 ₽ · 40 мин'),
    ],
    acceptedMasterId: null, conversationId: stableId('conversation', 2), reviewId: null,
  };

  // L3 — завершена, можно оставить отзыв
  const l3: DbLead = {
    id: stableId('lead', 3), number: nextNumber(state), clientId: client, cityId: 'msk', serviceId: 'port', modelId: 'redmi-note-13',
    description: 'Зарядка идёт только если держать кабель под углом.',
    urgency: 'flexible', visitType: 'workshop', preferredChannel: 'call', sharePhone: true, status: 'completed',
    createdAt: hours(24 * 13), updatedAt: hours(24 * 12), expiresAt: hours(24 * 10),
    recipients: [{ masterId: m5!.id, status: 'completed', viewedAt: hours(24 * 13 - 0.2) }],
    responses: [{ id: stableId('response', 20), masterId: m5!.id, price: { from: 1900, to: null }, message: 'Скорее всего, нужна чистка разъёма. Если не поможет — замена за 1 900 ₽.', etaMin: 30, createdAt: hours(24 * 13 - 0.4), status: 'accepted' }],
    timeline: [
      event('created', hours(24 * 13), 'client'),
      event('sent', hours(24 * 13), 'system', 'Отправлено 1 мастеру'),
      event('responded', hours(24 * 13 - 0.4), 'master', 'от 1 900 ₽ · 30 мин'),
      event('accepted', hours(24 * 13 - 0.3), 'client'),
      event('completed', hours(24 * 12), 'client', 'Разъём заменён, гарантия 3 месяца'),
    ],
    acceptedMasterId: m5!.id, conversationId: null, reviewId: null,
  };
  for (const lead of [l1, l2, l3]) state.leads.set(lead.id, lead);

  // Входящие заявки демо-мастера от других клиентов
  const rng = new Rng('incoming');
  const statuses: LeadStatus[] = ['new', 'new', 'new', 'viewed', 'responded', 'responded', 'completed'];
  const ages = [0.2, 0.7, 2, 5, 22, 46, 24 * 6];
  const models = MODELS.filter((m) => m.tier >= 2);
  statuses.forEach((status, i) => {
    const clientUser = [...state.users.values()].filter((u) => u.id.length && u.roles.length === 1 && u.id !== client)[i % CLIENT_NAMES.length]!;
    const serviceId = rng.pick(demoMaster.serviceIds.filter((s) => s !== 'diagnostics'));
    const model = rng.pick(models);
    const createdAt = hours(ages[i]!);
    const lead: DbLead = {
      id: stableId('lead-in', i), number: nextNumber(state), clientId: clientUser.id, cityId: 'msk', serviceId, modelId: model.id,
      description: rng.pick([
        'Телефон упал, экран треснул в углу, сенсор работает. Нужна замена сегодня.',
        'После обновления постоянно перезагружается, данные важны.',
        'Перестал заряжаться, разъём уже чистил — не помогло.',
        'Аккумулятор вздулся, крышка отходит. Нужно срочно.',
        'Камера не фокусируется, на фото всё размыто.',
        'Не слышно собеседника, только на громкой связи.',
      ]),
      urgency: rng.pick(['asap', 'today', 'this_week', 'flexible'] as const), visitType: rng.pick(['workshop', 'workshop', 'courier', 'onsite'] as const),
      preferredChannel: rng.pick(['chat', 'call', 'telegram'] as const), sharePhone: rng.chance(0.6), status,
      createdAt, updatedAt: createdAt, expiresAt: new Date(Date.parse(createdAt) + 72 * 3_600_000).toISOString(),
      recipients: [
        { masterId: demoMaster.id, status, viewedAt: status === 'new' ? null : hours(ages[i]! - 0.1) },
        ...rng.sample(msk, rng.int(1, 3)).map((m) => ({ masterId: m.id, status: 'viewed' as LeadStatus, viewedAt: createdAt })),
      ],
      responses:
        status === 'responded' || status === 'completed'
          ? [{ id: stableId('response-in', i), masterId: demoMaster.id, price: { from: rng.int(20, 90) * 100, to: null }, message: 'Здравствуйте! Можем сделать сегодня, запчасть в наличии.', etaMin: 45, createdAt: hours(ages[i]! - 0.3), status: status === 'completed' ? 'accepted' : 'pending' }]
          : [],
      timeline: [event('created', createdAt, 'client'), event('sent', createdAt, 'system')],
      acceptedMasterId: status === 'completed' ? demoMaster.id : null, conversationId: null, reviewId: null,
    };
    state.leads.set(lead.id, lead);
  });

  // Диалоги
  const c1: DbConversation = {
    id: l1.conversationId!, leadId: l1.id, clientId: client, masterId: demoMaster.id, subject: 'Замена дисплея · iPhone 13 Pro',
    messages: [
      { id: uuidv7(Date.parse(hours(25.3))), author: 'system', kind: 'system', text: 'Мастер ответил на заявку: 11 900 – 15 400 ₽, 40 минут', createdAt: hours(25.3), clientId: null },
      { id: uuidv7(Date.parse(hours(24.2))), author: 'client', kind: 'text', text: 'Здравствуйте! А оригинал точно оригинал? Будет ли сообщение «неизвестная деталь»?', createdAt: hours(24.2), clientId: null },
      { id: uuidv7(Date.parse(hours(24.1))), author: 'master', kind: 'text', text: 'Да, оригинальный модуль, снятый с нового устройства. Сообщение может появиться — это нормально для iPhone, на работу не влияет. Покажем деталь до установки.', createdAt: hours(24.1), clientId: null },
      { id: uuidv7(Date.parse(hours(24))), author: 'client', kind: 'text', text: 'Отлично, тогда оригинал. Буду сегодня в 18:30.', createdAt: hours(24), clientId: null },
      { id: uuidv7(Date.parse(hours(2))), author: 'master', kind: 'text', text: 'Приступили к замене, будет готово примерно через 40 минут — напишем сюда 👍', createdAt: hours(2), clientId: null },
    ],
    readAt: { client: hours(2.5), master: hours(1) },
  };
  const c2: DbConversation = {
    id: l2.conversationId!, leadId: l2.id, clientId: client, masterId: batteryMasters[0]!.id, subject: 'Замена аккумулятора · Galaxy A54',
    messages: [
      { id: uuidv7(Date.parse(minutes(70))), author: 'master', kind: 'offer', text: 'Аккумулятор для A54 есть в наличии, замена 25 минут, гарантия 6 месяцев. Курьер заберёт сегодня. Цена 3 400 ₽.', createdAt: minutes(70), clientId: null },
    ],
    readAt: { client: hours(3), master: minutes(70) },
  };
  const c3: DbConversation = {
    id: stableId('conversation', 3), leadId: null, clientId: client, masterId: null, subject: 'Поддержка Masterly',
    messages: [
      { id: uuidv7(Date.parse(hours(24 * 9))), author: 'support', kind: 'text', text: 'Здравствуйте, Алина! Это поддержка Masterly. Если появятся вопросы по работе платформы или гарантии — пишите сюда, отвечаем 24/7.', createdAt: hours(24 * 9), clientId: null },
    ],
    readAt: { client: hours(24 * 8), master: hours(24 * 9) },
  };
  for (const conversation of [c1, c2, c3]) state.conversations.set(conversation.id, conversation);

  state.notifications.set(client, [
    { id: stableId('n', 1), kind: 'lead', title: 'Новый ответ на заявку', body: '2 мастера предложили цену за замену аккумулятора Galaxy A54', href: `/orders/${l2.id}`, createdAt: minutes(35), read: false },
    { id: stableId('n', 2), kind: 'message', title: 'Сообщение от мастера', body: 'Приступили к замене, будет готово примерно через 40 минут', href: `/messages?c=${c1.id}`, createdAt: hours(2), read: false },
    { id: stableId('n', 3), kind: 'review', title: 'Оцените ремонт', body: 'Как прошла замена разъёма на Redmi Note 13? Отзыв поможет другим', href: `/orders/${l3.id}`, createdAt: hours(24 * 12), read: true },
  ]);
  state.notifications.set(DEMO_ACCOUNTS.master.id, [
    { id: stableId('n', 10), kind: 'lead', title: 'Новая заявка рядом', body: 'Срочно: замена дисплея, 1,8 км от вас', href: '/cabinet/leads', createdAt: minutes(12), read: false },
    { id: stableId('n', 11), kind: 'review', title: 'Новый отзыв ★★★★★', body: '«Очень аккуратная работа: никаких следов вскрытия»', href: '/cabinet/reviews', createdAt: hours(6), read: false },
  ]);
  state.notifications.set(DEMO_ACCOUNTS.admin.id, [
    { id: stableId('n', 20), kind: 'moderation', title: 'Высокий риск: накрутка отзывов', body: '4 почти одинаковых отзыва за 2 часа с одного устройства', href: '/admin/moderation', createdAt: minutes(18), read: false },
    { id: stableId('n', 21), kind: 'moderation', title: 'Найдены дубликаты профилей', body: 'Совпадение телефона и адреса у 3 пар профилей', href: '/admin/duplicates', createdAt: hours(3), read: false },
  ]);
}

function createState(): MockState {
  const masters = getMasters().map((master) => ({ ...master, ratingDistribution: [...master.ratingDistribution] as MasterFixture['ratingDistribution'] }));
  const demoMaster = pickDemoMaster(masters);
  // Демо-мастер на тарифе Pro: в кабинете видна расширенная аналитика
  demoMaster.plan = 'pro';
  const state: MockState = {
    masters,
    masterById: new Map(masters.map((m) => [m.id, m])),
    masterBySlug: new Map(masters.map((m) => [m.slug, m])),
    demoMasterId: demoMaster.id,
    users: new Map(),
    otp: new Map(),
    settings: new Map(),
    favorites: new Map([[DEMO_ACCOUNTS.client.id, new Set(masters.filter((m) => m.cityId === 'msk' && m.rating >= 4.8).slice(0, 4).map((m) => m.id))]]),
    leads: new Map(),
    leadSeq: 104_210,
    conversations: new Map(),
    notifications: new Map(),
    reveals: [],
    reviewReplies: new Map(),
    createdReviews: [],
    priceFactors: new Map(),
    offerOverrides: new Map(),
    disabledServices: new Map(),
    scheduleOverrides: new Map(),
    teams: new Map(),
    invoices: new Map(),
    moderation: null,
    duplicateStatus: new Map(),
    serviceOverrides: new Map(),
    categoryStatus: new Map(),
    searchLog: [],
    idempotency: new Map(),
  };
  seedUsers(state);
  seedLeadsAndChats(state);
  return state;
}

const globalStore = globalThis as typeof globalThis & { __masterlyMockState?: MockState };

/**
 * Состояние живёт в globalThis: в Next.js RSC и route handlers собираются в разные графы модулей,
 * а демо должно видеть одни и те же данные везде.
 */
export function getDb(): MockState {
  globalStore.__masterlyMockState ??= createState();
  return globalStore.__masterlyMockState;
}

export function resetDb(): void {
  globalStore.__masterlyMockState = createState();
}

export const newId = () => uuidv7();

export function nextLeadNumber(): string {
  const db = getDb();
  db.leadSeq += 7;
  return `M-${db.leadSeq}`;
}
