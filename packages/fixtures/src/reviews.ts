import { MODELS } from './devices.js';
import type { MasterFixture } from './masters.js';
import { Rng, stableId } from './prng.js';
import { serviceById } from './services.js';
import { warrantyLabel } from './text.js';

export interface ReviewFixture {
  id: string;
  masterId: string;
  authorName: string;
  rating: number;
  text: string;
  serviceId: string;
  modelId: string;
  createdAt: string;
  /** Отзыв оставлен после заявки через платформу — «проверенный». */
  verified: boolean;
  photos: number;
  helpful: number;
  reply: { text: string; createdAt: string } | null;
  /** Сигналы антифрода (для модерации). */
  signals: { accountAgeDays: number; deviceCluster: string | null };
}

const AUTHORS = ['Анна', 'Мария', 'Екатерина', 'Ольга', 'Дарья', 'Алина', 'Виктория', 'Ксения', 'Наталья', 'Полина', 'Алексей', 'Дмитрий', 'Сергей', 'Андрей', 'Максим', 'Иван', 'Артём', 'Михаил', 'Никита', 'Егор', 'Роман', 'Павел', 'Илья', 'Кирилл', 'Денис', 'Тимур', 'Олег', 'Евгений'];
const LETTERS = 'АБВГДЕЗИКЛМНОПРСТФШЯ';

const POSITIVE = [
  '{Service} на {model} сделали за {time}. Всё работает идеально, дали гарантию на {warranty}. Рекомендую!',
  'Обратился с проблемой «{problem}». Мастер сразу назвал цену, и она не изменилась. Через {time} забрал телефон как новый.',
  'Очень аккуратная работа: никаких следов вскрытия, все винтики на месте. {Service} — без нареканий.',
  'Цена совпала с указанной на Masterly, без доплат и сюрпризов. Спасибо за честность!',
  'Пришёл без записи, приняли сразу. Пока пил кофе рядом, телефон уже был готов.',
  'Мастер объяснил, что именно сломалось, и показал старую деталь. Приятно, когда всё прозрачно.',
  'Уже второй раз обращаюсь сюда — {service} на {model} поменяли быстро и качественно.',
  'Спасли телефон после того, как в другом сервисе сказали, что ремонт невозможен. Огромное спасибо!',
  'Удобно, что можно сравнить цены и сразу написать мастеру в чате. Ответили за пару минут.',
  'Курьер забрал телефон из офиса и вернул вечером уже отремонтированным. Сервис на высоте.',
];
const NEUTRAL = [
  'В целом хорошо, но ремонт занял больше времени, чем обещали — ждал запчасть почти день.',
  'Сделали нормально, но пришлось пару раз напоминать о себе в чате.',
  'Качество хорошее, цена чуть выше средней по району, зато гарантия длинная.',
];
const NEGATIVE = [
  'Через неделю снова появилась проблема. По гарантии переделали, но осадок остался.',
  'Цена в итоге оказалась выше, чем договаривались, объяснили это «дополнительными работами».',
  'Долго не отвечали в чате, в итоге обратился в другой сервис.',
];
const REPLIES_GOOD = ['Спасибо за отзыв! Рады, что смогли помочь.', 'Благодарим за доверие! Ждём вас снова.', 'Спасибо! Берегите телефон 🙂'];
const REPLIES_BAD = [
  'Приносим извинения за задержку — запчасть пришла позже, чем планировали. Мы учли этот случай.',
  'Спасибо, что сообщили. Напишите нам в чат — разберёмся по гарантии.',
];

const lower = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);
const upper = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Отзывы генерируются лениво и детерминированно — хранить сотни тысяч строк в памяти не нужно. */
export function reviewsFor(master: MasterFixture, limit = 40, now = Date.now()): ReviewFixture[] {
  const rng = new Rng(`reviews:${master.id}`);
  const count = Math.min(limit, master.reviewsCount);
  const ratingPool = master.ratingDistribution.map((n, i) => [i + 1, n] as const).filter(([, n]) => n > 0);
  const models = MODELS.filter((m) => master.brandIds.includes(m.brandId));
  const services = master.serviceIds.filter((s) => s !== 'diagnostics');
  let cursor = now - rng.int(2, 40) * 3_600_000;

  return Array.from({ length: count }, (_, i) => {
    const rating = rng.weighted(ratingPool);
    const service = serviceById.get(rng.pick(services))!;
    const model = rng.pick(models);
    const template = rating >= 5 ? rng.pick(POSITIVE) : rating >= 3 ? rng.pick(rating === 4 ? [...POSITIVE, ...NEUTRAL] : NEUTRAL) : rng.pick(NEGATIVE);
    const text = template
      .replaceAll('{Service}', service.name)
      .replaceAll('{service}', lower(service.short))
      .replaceAll('{model}', model.name)
      .replaceAll('{time}', rng.pick(['30 минут', '40 минут', 'час', 'полтора часа', 'два часа']))
      .replaceAll('{warranty}', warrantyLabel(master.warrantyDays))
      .replaceAll('{problem}', upper(service.problem));
    const createdAt = cursor;
    cursor -= rng.int(10, 9 * 24) * 3_600_000;
    const hasReply = rng.chance(rating <= 3 ? 0.85 : 0.35);
    return {
      id: stableId('review', `${master.id}:${i}`),
      masterId: master.id,
      authorName: `${rng.pick(AUTHORS)} ${LETTERS[rng.int(0, LETTERS.length - 1)]}.`,
      rating,
      text,
      serviceId: service.id,
      modelId: model.id,
      createdAt: new Date(createdAt).toISOString(),
      verified: rng.chance(0.82),
      photos: rng.chance(0.18) ? rng.int(1, 3) : 0,
      helpful: rng.int(0, 14),
      reply: hasReply
        ? { text: rng.pick(rating <= 3 ? REPLIES_BAD : REPLIES_GOOD), createdAt: new Date(createdAt + rng.int(1, 20) * 3_600_000).toISOString() }
        : null,
      signals: { accountAgeDays: rng.int(30, 2400), deviceCluster: null },
    };
  });
}

/**
 * Пачка подозрительных отзывов (накрутка): почти одинаковые тексты, новые аккаунты,
 * одно устройство, один день. Используется для демонстрации антифрода.
 */
export function suspiciousReviewsFor(master: MasterFixture, now = Date.now()): ReviewFixture[] {
  const base = 'Лучший сервис в городе! Сделали всё быстро и дёшево, мастер профессионал, всем советую только сюда!';
  const variants = [base, base.replace('всем советую', 'всем рекомендую'), base.replace('в городе', 'в Москве'), base.replace('быстро и дёшево', 'дёшево и быстро')];
  return variants.map((text, i) => ({
    id: stableId('review-suspicious', `${master.id}:${i}`),
    masterId: master.id,
    authorName: `${AUTHORS[i * 3]} ${LETTERS[i]}.`,
    rating: 5,
    text,
    serviceId: 'display',
    modelId: MODELS[i]!.id,
    createdAt: new Date(now - (i + 1) * 23 * 60_000).toISOString(),
    verified: false,
    photos: 0,
    helpful: 0,
    reply: null,
    signals: { accountAgeDays: i, deviceCluster: 'fp_7c1e9a' },
  }));
}
