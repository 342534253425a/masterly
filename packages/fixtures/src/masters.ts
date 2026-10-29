import { slugify, transliterate, type WeeklySchedule } from '@masterly/kernel';
import { CITIES, type CityFixture, type DistrictFixture } from './cities.js';
import { BRANDS, MODELS } from './devices.js';
import { Rng, stableId } from './prng.js';
import { SERVICES } from './services.js';
import { plural } from './text.js';

export type MasterKind = 'workshop' | 'individual';
export type VisitType = 'workshop' | 'onsite' | 'courier';
export type PaymentMethod = 'cash' | 'card' | 'sbp';
export type PartsQuality = 'original' | 'oem' | 'copy';

export interface PhotoFixture {
  id: string;
  serviceId: string;
  modelId: string;
  caption: string;
  /** Имитация перцептивного хэша (pHash) — для поиска одинаковых фото у разных профилей. */
  hash: string;
}

export interface BranchFixture {
  id: string;
  name: string;
  districtId: string;
  address: string;
  location: { lat: number; lng: number };
}

export interface StaffFixture {
  id: string;
  name: string;
  role: 'owner' | 'senior' | 'master' | 'manager';
  experienceYears: number;
}

export interface MasterFixture {
  id: string;
  slug: string;
  kind: MasterKind;
  name: string;
  initials: string;
  hue: number;
  tagline: string;
  about: string;
  cityId: string;
  districtId: string;
  landmark: string;
  address: string;
  location: { lat: number; lng: number };
  rating: number;
  reviewsCount: number;
  /** Количество отзывов с оценкой 1…5. */
  ratingDistribution: [number, number, number, number, number];
  experienceYears: number;
  completedOrders: number;
  responseTimeMin: number;
  responseRate: number;
  priceLevel: number;
  warrantyDays: number;
  specialization: 'all' | 'apple' | 'android';
  brandIds: string[];
  serviceIds: string[];
  visitTypes: VisitType[];
  express: boolean;
  schedule: WeeklySchedule;
  verification: { identity: boolean; business: boolean; address: boolean; reviewedAt: string };
  plan: 'free' | 'pro';
  promotion: { erid: string } | null;
  phone: string;
  telegram: string | null;
  whatsapp: boolean;
  paymentMethods: PaymentMethod[];
  partsQualities: PartsQuality[];
  joinedAt: string;
  photos: PhotoFixture[];
  branches: BranchFixture[];
  staff: StaffFixture[];
  stats30d: { impressions: number; views: number; contactClicks: number; leads: number };
  completeness: number;
  /** Только для тестов антифрода: профиль сгенерирован как дубликат другого. */
  duplicateOf?: string;
}

const MALE = ['Алексей', 'Дмитрий', 'Сергей', 'Андрей', 'Максим', 'Иван', 'Артём', 'Михаил', 'Никита', 'Егор', 'Роман', 'Павел', 'Илья', 'Кирилл', 'Денис', 'Тимур', 'Руслан', 'Арсен', 'Давид', 'Олег', 'Константин', 'Владимир', 'Евгений', 'Антон'];
const FEMALE = ['Анна', 'Мария', 'Екатерина', 'Ольга', 'Дарья', 'Алина', 'Виктория', 'Ксения', 'Наталья', 'Полина'];
const SURNAMES = ['Морозов', 'Волков', 'Соколов', 'Лебедев', 'Козлов', 'Новиков', 'Попов', 'Кузнецов', 'Смирнов', 'Васильев', 'Петров', 'Фёдоров', 'Михайлов', 'Орлов', 'Андреев', 'Макаров', 'Никитин', 'Захаров', 'Зайцев', 'Борисов', 'Яковлев', 'Романов', 'Сергеев', 'Ильин', 'Гусев', 'Титов', 'Баранов', 'Куликов', 'Степанов', 'Павлов', 'Белов', 'Тарасов', 'Комаров', 'Мартынов', 'Арутюнян', 'Саркисян', 'Алиев', 'Гасанов', 'Каримов', 'Юсупов'];
const LATIN_PREFIX = ['iFix', 'Mobi', 'Smart', 'Phone', 'Gadget', 'Repair', 'Apple', 'Tech', 'Pixel', 'Fix', 'Droid', 'Nano'];
const LATIN_SUFFIX = ['Lab', 'Service', 'Point', 'Hub', 'Room', 'Studio', 'Garage', 'Pro', 'Care', 'Clinic'];
const RU_BRANDS = ['Пиксель', 'Мобильный доктор', 'Сота', 'Смартфикс', 'Микросхема', 'Ремфон', 'Мастерфон', 'Сигнал', 'Контакт', 'Батарейка', 'Паяльник', 'Экранчик', 'Гаджет-Сервис', 'Телефонный мастер'];
const WORKSHOP_TAGLINES = [
  'Ремонт iPhone и Android при вас за 30 минут', 'Оригинальные запчасти и гарантия до года',
  'Собственный склад запчастей — без ожидания', 'Бесплатная диагностика и курьер по городу',
  'Сложный ремонт плат и микропайка', 'Срочный ремонт без записи', 'Прозрачные цены — без доплат на месте',
];
const INDIVIDUAL_TAGLINES = [
  'Выезд на дом и в офис в удобное время', 'Аккуратная пайка и ремонт плат', 'Честная цена без наценки сервисов',
  'Ремонт в день обращения', 'Объясняю, что сломалось, и показываю старую деталь',
];
const ABOUT_WORK = [
  'Работаем с телефонами всех популярных брендов, большинство запчастей всегда в наличии.',
  'Ремонт проходит при клиенте в открытой зоне — можно наблюдать за работой.',
  'Используем профессиональное оборудование: ультразвуковые ванны, паяльные станции, сепараторы.',
  'Перед ремонтом согласуем стоимость, после — проверяем телефон вместе с вами.',
];
const ABOUT_GUARANTEE = [
  'На все работы даём письменную гарантию.',
  'Если проблема повторится в гарантийный срок, исправим бесплатно.',
  'Оплата после ремонта — наличными, картой или по СБП напрямую мастеру.',
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function initialsOf(name: string): string {
  const words = name.replace(/[«»"]/g, '').split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? 'M';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function workshopName(rng: Rng, district: DistrictFixture): string {
  const variant = rng.weighted([['latin', 0.45], ['ru', 0.4], ['district', 0.15]] as const);
  if (variant === 'latin') return `${rng.pick(LATIN_PREFIX)} ${rng.pick(LATIN_SUFFIX)}`;
  if (variant === 'ru') return `Сервисный центр «${rng.pick(RU_BRANDS)}»`;
  return `Мастерская «${district.name}»`;
}

function makeSchedule(rng: Rng, kind: MasterKind): WeeklySchedule {
  if (rng.chance(0.04)) return Array.from({ length: 7 }, () => ({ open: '00:00', close: '23:59' }));
  const weekday = { open: rng.pick(['09:00', '10:00', '10:00', '11:00']), close: rng.pick(['19:00', '20:00', '21:00', '21:00', '22:00']) };
  if (kind === 'workshop') {
    const saturday = rng.chance(0.6) ? weekday : { open: '11:00', close: '19:00' };
    const sunday = rng.chance(0.8) ? { open: '11:00', close: '19:00' } : null;
    return [weekday, weekday, weekday, weekday, weekday, saturday, sunday];
  }
  const dayOff = rng.int(0, 4);
  return Array.from({ length: 7 }, (_, day) => {
    if (day === 6) return rng.chance(0.3) ? { open: '12:00', close: '18:00' } : null;
    if (day === dayOff && rng.chance(0.5)) return null;
    return day === 5 ? { open: '11:00', close: '18:00' } : weekday;
  });
}

function scatter(rng: Rng, center: { lat: number; lng: number }, sigmaKm: number) {
  const sigmaLat = sigmaKm / 111.32;
  const sigmaLng = sigmaKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  return {
    lat: Number((center.lat + rng.gaussian(0, sigmaLat)).toFixed(6)),
    lng: Number((center.lng + rng.gaussian(0, sigmaLng)).toFixed(6)),
  };
}

function ratingDistribution(rng: Rng, target: number, count: number): [number, number, number, number, number] {
  const nonFive = clamp((5 - target) / 1.85, 0, 0.9);
  const shares = [0.15, 0.1, 0.2, 0.55].map((share) => share * nonFive);
  const counts = shares.map((share) => Math.round(share * count * rng.float(0.8, 1.2)));
  const five = Math.max(0, count - counts.reduce((a, b) => a + b, 0));
  return [counts[0]!, counts[1]!, counts[2]!, counts[3]!, five];
}

function digits(rng: Rng, length: number): string {
  return Array.from({ length }, () => rng.int(0, 9)).join('');
}

function generateMaster(city: CityFixture, index: number, usedSlugs: Set<string>): MasterFixture {
  const rng = new Rng(`master:${city.id}:${index}`);
  const id = stableId('master', `${city.id}:${index}`);
  const kind: MasterKind = rng.chance(0.62) ? 'workshop' : 'individual';
  const district = rng.pick(city.districts);
  const landmark = rng.pick(district.landmarks);
  const female = kind === 'individual' && rng.chance(0.14);
  const firstName = female ? rng.pick(FEMALE) : rng.pick(MALE);
  const surname = rng.pick(SURNAMES);
  const lastName = female && !surname.endsWith('ян') ? `${surname}а` : surname;
  const name = kind === 'workshop' ? workshopName(rng, district) : `${firstName} ${lastName}`;

  let slug = slugify(name);
  if (usedSlugs.has(slug)) slug = `${slug}-${slugify(district.name)}`;
  if (usedSlugs.has(slug)) slug = `${slug}-${index}`;
  usedSlugs.add(slug);

  const specialization = rng.weighted([['all', 0.55], ['apple', 0.3], ['android', 0.15]] as const);
  const brandIds =
    specialization === 'apple'
      ? ['apple']
      : specialization === 'android'
        ? BRANDS.filter((b) => b.id !== 'apple').map((b) => b.id)
        : BRANDS.map((b) => b.id);
  const available = SERVICES.filter((s) => !s.brandIds || s.brandIds.some((b) => brandIds.includes(b)));
  const core = new Set(['display', 'battery', 'port', 'diagnostics']);
  const extras = available.filter((s) => !core.has(s.id));
  const picked = new Set([...core, ...rng.sample(extras, kind === 'workshop' ? rng.int(5, extras.length) : rng.int(2, 6)).map((s) => s.id)]);
  const serviceIds = SERVICES.filter((s) => picked.has(s.id)).map((s) => s.id);

  const reviewsCount = Math.round(clamp(Math.exp(rng.gaussian(kind === 'workshop' ? 4.3 : 3.3, 0.85)), 3, 900));
  const distribution = ratingDistribution(rng, clamp(rng.gaussian(4.74, 0.17), 3.7, 5), reviewsCount);
  const total = distribution.reduce((a, b) => a + b, 0) || 1;
  const rating = Number((distribution.reduce((sum, n, i) => sum + n * (i + 1), 0) / total).toFixed(1));
  const experienceYears = rng.int(1, kind === 'workshop' ? 15 : 18);
  const plan = rng.chance(0.24) ? 'pro' : 'free';
  const verification = {
    identity: rng.chance(0.88),
    business: rng.chance(kind === 'workshop' ? 0.8 : 0.45),
    address: rng.chance(kind === 'workshop' ? 0.8 : 0.25),
    reviewedAt: new Date(Date.UTC(2026, rng.int(0, 9), rng.int(1, 28))).toISOString(),
  };
  const visitTypes: VisitType[] =
    kind === 'workshop'
      ? ['workshop', ...(rng.chance(0.5) ? (['courier'] as const) : []), ...(rng.chance(0.2) ? (['onsite'] as const) : [])]
      : [...(rng.chance(0.55) ? (['workshop'] as const) : []), 'onsite', ...(rng.chance(0.25) ? (['courier'] as const) : [])];

  const repairable = serviceIds.filter((s) => !['diagnostics', 'software', 'data'].includes(s));
  const deviceModels = MODELS.filter((m) => brandIds.includes(m.brandId) && m.tier >= 3);
  const photos: PhotoFixture[] = Array.from({ length: rng.int(3, 12) }, (_, i) => {
    const serviceId = rng.pick(repairable);
    const model = rng.pick(deviceModels);
    const service = SERVICES.find((s) => s.id === serviceId)!;
    return { id: stableId('photo', `${id}:${i}`), serviceId, modelId: model.id, caption: `${service.name} · ${model.name}`, hash: digits(rng, 16) };
  });

  const branches: BranchFixture[] = [];
  if (kind === 'workshop' && rng.chance(0.14)) {
    for (const branchDistrict of rng.sample(city.districts.filter((d) => d.id !== district.id), rng.int(1, 3))) {
      branches.push({
        id: stableId('branch', `${id}:${branchDistrict.id}`),
        name: `${name} · ${branchDistrict.name}`,
        districtId: branchDistrict.id,
        address: `${rng.pick(city.streets)}, ${rng.int(1, 140)}`,
        location: scatter(rng, branchDistrict, 0.6),
      });
    }
  }
  const staff: StaffFixture[] =
    kind === 'workshop'
      ? Array.from({ length: rng.int(2, 7) }, (_, i) => ({
          id: stableId('staff', `${id}:${i}`),
          name: `${rng.pick(MALE)} ${rng.pick(SURNAMES)}`,
          role: i === 0 ? 'owner' : i === 1 ? 'senior' : rng.chance(0.8) ? 'master' : 'manager',
          experienceYears: rng.int(1, 14),
        }))
      : [];

  const views = Math.round(reviewsCount * rng.float(3, 7) + rng.int(80, 420));
  const contactClicks = Math.round(views * rng.float(0.07, 0.15));
  const telegram = rng.chance(kind === 'workshop' ? 0.6 : 0.7)
    ? `@${transliterate(kind === 'workshop' ? slug : `${firstName}_${lastName}`).replace(/[^a-z0-9_]/g, '_').slice(0, 28)}`
    : null;
  const about =
    kind === 'workshop'
      ? `${name} — ${rng.pick(['сервисный центр', 'мастерская', 'ремонтная студия'])} в районе ${district.name}${
          city.hasMetro ? `, рядом с метро «${landmark}»` : `, ориентир — ${landmark}`
        }. ${rng.pick(ABOUT_WORK)} ${rng.pick(ABOUT_GUARANTEE)}`
      : `Меня зовут ${firstName}, ремонтирую телефоны ${experienceYears} ${plural(experienceYears, 'год', 'года', 'лет')}. ${rng.pick(ABOUT_WORK)} ${rng.pick(ABOUT_GUARANTEE)}`;
  const completeness = Math.min(
    100,
    40 + (photos.length >= 5 ? 15 : 5) + (verification.identity ? 15 : 0) + (telegram ? 5 : 0) + 10 + (staff.length || branches.length ? 5 : 0) + (verification.address ? 10 : 0),
  );

  return {
    id,
    slug,
    kind,
    name,
    initials: initialsOf(name),
    hue: rng.int(0, 359),
    tagline:
      kind === 'workshop'
        ? specialization === 'apple' && rng.chance(0.5)
          ? `Специализируемся на iPhone с ${2026 - experienceYears} года`
          : rng.pick(WORKSHOP_TAGLINES)
        : rng.chance(0.4)
          ? `Частный мастер, ${experienceYears} ${plural(experienceYears, 'год', 'года', 'лет')} опыта`
          : rng.pick(INDIVIDUAL_TAGLINES),
    about,
    cityId: city.id,
    districtId: district.id,
    landmark,
    address: `${rng.pick(city.streets)}, ${rng.int(1, 140)}${rng.chance(0.2) ? `к${rng.int(1, 4)}` : ''}`,
    location: scatter(rng, district, 1.1),
    rating,
    reviewsCount: total,
    ratingDistribution: distribution,
    experienceYears,
    completedOrders: experienceYears * (kind === 'workshop' ? rng.int(120, 420) : rng.int(40, 160)),
    responseTimeMin: Math.round(clamp(Math.exp(rng.gaussian(2.6, 0.6)), 2, 120)),
    responseRate: Number(rng.float(0.72, 0.99).toFixed(2)),
    priceLevel: Number(clamp(rng.gaussian(specialization === 'apple' ? 1.08 : 1, 0.11), 0.8, 1.32).toFixed(2)),
    warrantyDays: kind === 'workshop' ? rng.pick([90, 180, 180, 365]) : rng.pick([30, 60, 90, 90, 180]),
    specialization,
    brandIds,
    serviceIds,
    visitTypes,
    express: rng.chance(kind === 'workshop' ? 0.5 : 0.3),
    schedule: makeSchedule(rng, kind),
    verification,
    plan,
    promotion: plan === 'pro' && rng.chance(0.35) ? { erid: `2SDnje${digits(rng, 3)}${transliterate(slug).slice(0, 3).toUpperCase()}` } : null,
    phone: kind === 'workshop' ? `${city.phonePrefix}${digits(rng, 7)}` : `+79${digits(rng, 9)}`,
    telegram,
    whatsapp: rng.chance(0.55),
    paymentMethods: ['cash', ...(rng.chance(0.85) ? (['card'] as const) : []), ...(rng.chance(0.8) ? (['sbp'] as const) : [])],
    partsQualities:
      kind === 'workshop'
        ? (['original', 'oem', 'copy'] as const).filter((q) => q === 'oem' || rng.chance(0.75))
        : ['oem', 'copy', ...(rng.chance(0.3) ? (['original'] as const) : [])],
    joinedAt: new Date(Date.UTC(2023 + rng.int(0, 2), rng.int(0, 11), rng.int(1, 28))).toISOString(),
    photos,
    branches,
    staff,
    stats30d: { impressions: views * rng.int(6, 11), views, contactClicks, leads: Math.round(contactClicks * rng.float(0.35, 0.6)) },
    completeness,
  };
}

const COUNTS: Record<string, number> = { msk: 90, spb: 70, krd: 45 };

/** Подмешиваем намеренные дубликаты — на них демонстрируется антифрод в админке. */
function injectDuplicates(masters: MasterFixture[]): MasterFixture[] {
  const pick = (cityId: string, n: number) => masters.filter((m) => m.cityId === cityId)[n]!;
  const make = (original: MasterFixture, key: string, patch: Partial<MasterFixture>): MasterFixture => ({
    ...original,
    id: stableId('master-dup', key),
    slug: `${original.slug}-${key}`,
    duplicateOf: original.id,
    reviewsCount: 4,
    ratingDistribution: [0, 0, 0, 0, 4],
    rating: 5,
    plan: 'free',
    promotion: null,
    verification: { ...original.verification, identity: false, business: false },
    ...patch,
  });
  const a = pick('msk', 3);
  const b = pick('spb', 5);
  const c = pick('krd', 2);
  return [
    make(a, 'd1', { name: `${a.name.toUpperCase()} Сервис`, location: { lat: a.location.lat + 0.0004, lng: a.location.lng - 0.0003 } }),
    make(b, 'd2', { name: b.name.replace(/[«»]/g, '"'), phone: `+79${b.phone.slice(-9)}`, address: b.address }),
    make(c, 'd3', { districtId: CITIES[2]!.districts[4]!.id, location: { lat: c.location.lat + 0.02, lng: c.location.lng + 0.01 } }),
  ];
}

let cache: MasterFixture[] | null = null;

export function getMasters(): MasterFixture[] {
  if (cache) return cache;
  const used = new Set<string>();
  const masters = CITIES.flatMap((city) => Array.from({ length: COUNTS[city.id] ?? 30 }, (_, i) => generateMaster(city, i, used)));
  cache = [...masters, ...injectDuplicates(masters)];
  return cache;
}

/** Мастерская демо-аккаунта мастера: одинаковая в мок-бэкенде и в сидах catalog. */
export function pickDemoMaster(masters: readonly MasterFixture[] = getMasters()): MasterFixture {
  return (
    masters.find(
      (m) =>
        m.cityId === 'msk' &&
        m.kind === 'workshop' &&
        m.specialization === 'all' &&
        m.rating >= 4.7 &&
        m.reviewsCount >= 60 &&
        ['display', 'battery', 'port', 'camera'].every((s) => m.serviceIds.includes(s)),
    ) ?? masters[0]!
  );
}
