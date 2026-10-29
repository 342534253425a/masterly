/**
 * Профили нагрузки k6. Целевые RPS — из docs/architecture/capacity-planning.md
 * (пик ⅓ Avito ≈ 25 000 RPS на шлюзе, из них поиск ≈ 9 000 RPS).
 *
 *   k6 run tests/load/search.js -e PROFILE=load -e TARGET_RPS=2000 -e BASE_URL=https://staging.masterly.ru
 */
const PROFILE = __ENV.PROFILE || 'smoke';
const TARGET = Number(__ENV.TARGET_RPS || 200);

const PROFILES = {
  // Быстрая проверка после выкатки: работает ли всё вообще
  smoke: { executor: 'constant-vus', vus: 2, duration: '30s' },
  // Номинальная нагрузка с разгоном: проверка SLO
  load: {
    executor: 'ramping-arrival-rate',
    startRate: Math.ceil(TARGET / 10),
    timeUnit: '1s',
    preAllocatedVUs: Math.ceil(TARGET / 4),
    maxVUs: TARGET * 2,
    stages: [
      { target: TARGET, duration: '3m' },
      { target: TARGET, duration: '10m' },
      { target: 0, duration: '1m' },
    ],
  },
  // Поиск точки деградации: где ломаются p95 и доля ошибок
  stress: {
    executor: 'ramping-arrival-rate',
    startRate: Math.ceil(TARGET / 4),
    timeUnit: '1s',
    preAllocatedVUs: TARGET,
    maxVUs: TARGET * 4,
    stages: [
      { target: TARGET, duration: '2m' },
      { target: TARGET * 2, duration: '5m' },
      { target: TARGET * 3, duration: '5m' },
      { target: 0, duration: '2m' },
    ],
  },
  // Вечерний пик / рекламная кампания: x5 за 30 секунд — проверка HPA/KEDA и load shedding
  spike: {
    executor: 'ramping-arrival-rate',
    startRate: TARGET,
    timeUnit: '1s',
    preAllocatedVUs: TARGET,
    maxVUs: TARGET * 6,
    stages: [
      { target: TARGET, duration: '1m' },
      { target: TARGET * 5, duration: '30s' },
      { target: TARGET * 5, duration: '3m' },
      { target: TARGET, duration: '1m' },
    ],
  },
  // Долгий прогон: утечки памяти, рост лага Kafka, деградация пулов соединений
  soak: { executor: 'constant-arrival-rate', rate: TARGET, timeUnit: '1s', duration: '4h', preAllocatedVUs: TARGET, maxVUs: TARGET * 2 },
};

export function scenario(exec = 'default') {
  const config = PROFILES[PROFILE];
  if (!config) throw new Error(`Неизвестный PROFILE=${PROFILE}`);
  return { [PROFILE]: { ...config, exec } };
}

export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
export const API = `${BASE_URL}/api/v1`;

export function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}
