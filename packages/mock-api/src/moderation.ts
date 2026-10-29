import type { DuplicateCandidate, ModerationItem } from '@masterly/contracts';
import { stableId, suspiciousReviewsFor, type MasterFixture } from '@masterly/fixtures';
import { geohashEncode, hammingDistance, haversineKm, jaccard, normalizeRuPhone, normalizeText, simhash64, trigramSimilarity } from '@masterly/kernel';
import { getDb } from './db.js';
import { toMasterLite } from './mappers.js';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** Скоринг риска для накрученных отзывов: SimHash-кластеры, возраст аккаунта, отпечаток устройства. */
function reviewItems(master: MasterFixture): ModerationItem[] {
  const reviews = suspiciousReviewsFor(master);
  const hashes = reviews.map((r) => simhash64(r.text));
  return reviews.map((review, i) => {
    const distances = hashes.filter((_, j) => j !== i).map((h) => hammingDistance(hashes[i]!, h));
    const near = distances.filter((d) => d <= 8);
    const reasons = [
      ...(near.length >= 2 ? [{ code: 'near_duplicate', label: `Почти дубликат ${near.length} других отзывов (SimHash, Хэмминг ≤ ${Math.max(...near)})`, weight: 0.4 }] : []),
      ...(review.signals.accountAgeDays < 7 ? [{ code: 'new_account', label: `Аккаунту ${review.signals.accountAgeDays} дн.`, weight: 0.25 }] : []),
      ...(review.signals.deviceCluster ? [{ code: 'device_cluster', label: `Одно устройство у ${reviews.length} авторов за 2 часа`, weight: 0.2 }] : []),
      ...(!review.verified ? [{ code: 'no_lead', label: 'Нет завершённой заявки через платформу', weight: 0.15 }] : []),
    ];
    return {
      id: stableId('moderation-review', i),
      kind: 'review' as const,
      status: 'pending' as const,
      createdAt: review.createdAt,
      title: `Отзыв ★${review.rating} о «${master.name}»`,
      content: review.text,
      riskScore: Math.min(1, Number(reasons.reduce((sum, r) => sum + r.weight, 0).toFixed(2))),
      reasons,
      master: toMasterLite(master),
      author: review.authorName,
    };
  });
}

function scorePair(a: MasterFixture, b: MasterFixture): DuplicateCandidate {
  const distanceKm = haversineKm(a.location, b.location);
  const nameSimilarity = trigramSimilarity(a.name, b.name);
  const photoOverlap = jaccard(a.photos.map((p) => p.hash), b.photos.map((p) => p.hash));
  const signals = [
    { code: 'phone' as const, label: 'Совпадает телефон', value: a.phone === b.phone ? 1 : 0, weight: 0.4 },
    { code: 'telegram' as const, label: 'Совпадает Telegram', value: a.telegram && a.telegram === b.telegram ? 1 : 0, weight: 0.2 },
    { code: 'name' as const, label: 'Похожее название (триграммы)', value: Number(nameSimilarity.toFixed(2)), weight: nameSimilarity >= 0.5 ? 0.2 : 0 },
    { code: 'address' as const, label: 'Тот же адрес', value: normalizeText(a.address) === normalizeText(b.address) ? 1 : 0, weight: 0.15 },
    { code: 'geo' as const, label: 'Расстояние, км', value: Number(distanceKm.toFixed(2)), weight: distanceKm < 0.15 ? 0.15 : 0 },
    { code: 'photos' as const, label: 'Общие фото (pHash)', value: Number(photoOverlap.toFixed(2)), weight: 0.3 },
  ];
  const score = Math.min(
    1,
    signals.reduce((sum, s) => sum + (s.code === 'geo' ? s.weight : s.code === 'name' ? s.weight * s.value : s.weight * s.value), 0),
  );
  const id = stableId('duplicate', [a.id, b.id].sort().join(':'));
  return {
    id,
    score: Number(score.toFixed(2)),
    a: toMasterLite(a),
    b: toMasterLite(b),
    signals: signals.map(({ code, label, value }) => ({
      code,
      label,
      value,
      matched: code === 'geo' ? value < 0.15 : code === 'name' ? value >= 0.5 : value >= 0.5,
    })),
    status: getDb().duplicateStatus.get(id) ?? 'open',
  };
}

let duplicatesCache: DuplicateCandidate[] | null = null;

/**
 * Поиск дубликатов без O(n²): блокинг по ключам (телефон, Telegram, geohash-ячейка, адрес),
 * затем скоринг только пар внутри блоков. Так же работает trust-сервис на всей базе.
 */
export function computeDuplicates(): DuplicateCandidate[] {
  if (duplicatesCache) return duplicatesCache.map((c) => ({ ...c, status: getDb().duplicateStatus.get(c.id) ?? 'open' }));
  const blocks = new Map<string, MasterFixture[]>();
  const add = (key: string, master: MasterFixture) => blocks.set(key, [...(blocks.get(key) ?? []), master]);
  for (const master of getDb().masters) {
    add(`phone:${normalizeRuPhone(master.phone) ?? master.phone}`, master);
    if (master.telegram) add(`tg:${master.telegram.toLowerCase()}`, master);
    add(`geo:${master.cityId}:${geohashEncode(master.location, 6)}`, master);
    add(`addr:${master.cityId}:${normalizeText(master.address)}`, master);
  }
  const pairs = new Map<string, [MasterFixture, MasterFixture]>();
  for (const group of blocks.values()) {
    if (group.length < 2 || group.length > 40) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i]!, group[j]!];
        if (a.id !== b.id) pairs.set([a.id, b.id].sort().join(':'), [a, b]);
      }
    }
  }
  duplicatesCache = [...pairs.values()]
    .map(([a, b]) => scorePair(a, b))
    .filter((candidate) => candidate.score >= 0.55)
    .sort((x, y) => y.score - x.score);
  return duplicatesCache;
}

export function ensureModeration(): Map<string, ModerationItem> {
  const db = getDb();
  if (db.moderation) return db.moderation;
  const items: ModerationItem[] = [];
  const target = db.masters.find((m) => m.cityId === 'msk' && m.id !== db.demoMasterId && m.reviewsCount > 30 && !m.duplicateOf)!;
  items.push(...reviewItems(target));

  for (const duplicate of db.masters.filter((m) => m.duplicateOf)) {
    const original = db.masterById.get(duplicate.duplicateOf!)!;
    items.push({
      id: stableId('moderation-profile', duplicate.id),
      kind: 'profile',
      status: 'pending',
      createdAt: minutesAgo(180),
      title: `Новый профиль «${duplicate.name}»`,
      content: `Возможный дубликат профиля «${original.name}». ${duplicate.address}`,
      riskScore: 0.82,
      reasons: [
        { code: 'duplicate_candidate', label: 'Совпадение с существующим профилем (телефон / адрес / фото)', weight: 0.6 },
        { code: 'unverified', label: 'Документы не загружены', weight: 0.22 },
      ],
      master: toMasterLite(duplicate),
      author: null,
    });
    const photo = duplicate.photos[0];
    if (photo) {
      items.push({
        id: stableId('moderation-photo', duplicate.id),
        kind: 'photo',
        status: 'pending',
        createdAt: minutesAgo(170),
        title: `Фото в портфолио «${duplicate.name}»`,
        content: photo.caption,
        riskScore: 0.7,
        reasons: [{ code: 'phash_match', label: `pHash совпадает с фото профиля «${original.name}»`, weight: 0.7 }],
        master: toMasterLite(duplicate),
        author: null,
      });
    }
  }

  const spammer = db.masters.find((m) => m.cityId === 'spb' && m.kind === 'individual')!;
  items.push({
    id: stableId('moderation-description', spammer.id),
    kind: 'description',
    status: 'pending',
    createdAt: minutesAgo(42),
    title: `Изменение описания «${spammer.name}»`,
    content: 'ЛУЧШИЙ РЕМОНТ В ГОРОДЕ!!! Звоните напрямую 8-921-000-00-00, скидка 50% только сегодня!!! Гарантия 100 лет',
    riskScore: 0.7,
    reasons: [
      { code: 'contacts_in_text', label: 'Телефон в тексте — обход контроля передачи контактов', weight: 0.35 },
      { code: 'promo_claims', label: 'Недостоверные обещания («гарантия 100 лет»)', weight: 0.2 },
      { code: 'caps', label: 'Капс и избыточные восклицания', weight: 0.15 },
    ],
    master: toMasterLite(spammer),
    author: null,
  });

  const newcomer = db.masters.find((m) => m.cityId === 'krd' && m.verification.identity)!;
  items.push({
    id: stableId('moderation-newcomer', newcomer.id),
    kind: 'profile',
    status: 'pending',
    createdAt: minutesAgo(25),
    title: `Обновление профиля «${newcomer.name}»`,
    content: newcomer.about,
    riskScore: 0.08,
    reasons: [],
    master: toMasterLite(newcomer),
    author: null,
  });

  db.moderation = new Map(items.map((item) => [item.id, item]));
  return db.moderation;
}
