import { check, sleep } from 'k6';
import http from 'k6/http';
import { API, BASE_URL, pick, scenario } from './lib/profiles.js';

/**
 * Сценарий записи: вход → заявка (с Idempotency-Key) → повтор той же заявки (не создаёт дубль) → чтение.
 * Целевая доля в трафике мала (~2% RPS), но это самый «дорогой» путь: транзакция + outbox + Kafka.
 */
export const options = {
  scenarios: scenario('default'),
  thresholds: {
    http_req_failed: ['rate<0.001'],
    'http_req_duration{endpoint:create_lead}': ['p(95)<400', 'p(99)<900'],
    'http_req_duration{endpoint:get_lead}': ['p(95)<150'],
    checks: ['rate>0.999'],
  },
};

const SERVICES = ['display', 'battery', 'port', 'camera'];
const MODELS = ['iphone-13', 'iphone-15-pro', 'galaxy-a54', 'redmi-note-13', null];
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Живой режим: демо-входа нет (ADR-0012) — передайте cookie заранее выпущенной тестовой сессии:
 *   k6 run tests/load/lead-flow.js -e BASE_URL=https://staging.masterly.ru -e AUTH_COOKIE=<значение mly_at>
 * Без AUTH_COOKIE используется демо-вход мок-бэкенда (фронтенд в режиме API_MODE=mock).
 */
const AUTH_COOKIE = __ENV.AUTH_COOKIE;

export default function () {
  const jar = http.cookieJar();
  if (AUTH_COOKIE) {
    jar.set(BASE_URL, 'mly_at', AUTH_COOKIE);
  } else {
    const login = http.post(`${API}/auth/demo`, JSON.stringify({ role: 'client' }), { headers: JSON_HEADERS, tags: { endpoint: 'login' }, jar });
    check(login, { 'login 200': (r) => r.status === 200 });
  }

  const key = uuid();
  const body = JSON.stringify({
    masterIds: [],
    broadcast: true,
    cityId: 'msk',
    serviceId: pick(SERVICES),
    modelId: pick(MODELS),
    description: 'Нагрузочный тест: разбит экран, сенсор работает частично',
    urgency: 'today',
    visitType: 'workshop',
    preferredChannel: 'chat',
    sharePhone: false,
  });
  const headers = { ...JSON_HEADERS, 'Idempotency-Key': key };
  const created = http.post(`${API}/leads`, body, { headers, tags: { endpoint: 'create_lead' }, jar });
  const ok = check(created, { 'lead 201': (r) => r.status === 201 });
  if (!ok) return;

  // Повтор с тем же ключом (сетевой ретрай клиента) обязан вернуть ту же заявку
  const repeated = http.post(`${API}/leads`, body, { headers, tags: { endpoint: 'create_lead_retry' }, jar });
  check(repeated, { 'идемпотентность': (r) => r.json('id') === created.json('id') });

  sleep(1);
  const lead = http.get(`${API}/leads/${created.json('id')}`, { tags: { endpoint: 'get_lead' }, jar });
  check(lead, { 'lead 200': (r) => r.status === 200, 'есть получатели': (r) => (r.json('recipients') || []).length > 0 });
}
