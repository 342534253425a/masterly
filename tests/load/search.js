import { check, group } from 'k6';
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';
import { API, pick, scenario } from './lib/profiles.js';

/**
 * Основной сценарий чтения: смесь, близкая к реальной (по доле в трафике шлюза):
 * 55% поиск по проблеме, 20% подсказки, 15% профиль мастера, 10% пины карты.
 */
export const options = {
  scenarios: scenario('default'),
  thresholds: {
    http_req_failed: ['rate<0.001'], // ≤ 0.1% ошибок
    'http_req_duration{endpoint:search}': ['p(95)<250', 'p(99)<600'],
    'http_req_duration{endpoint:suggest}': ['p(95)<120'],
    'http_req_duration{endpoint:master}': ['p(95)<200'],
    'http_req_duration{endpoint:map}': ['p(95)<300'],
    checks: ['rate>0.999'],
  },
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'],
};

const CITIES = ['moskva', 'moskva', 'moskva', 'sankt-peterburg', 'sankt-peterburg', 'krasnodar'];
const QUERIES = [
  'разбил экран iphone 13',
  'не заряжается samsung a54',
  'быстро садится айфон 11',
  'упал в воду',
  'замена аккумулятора redmi note 12',
  'не работает face id',
  'треснуло стекло камеры',
  'не ловит сеть',
  'висит на логотипе',
  'iphone 15 pro max дисплей',
];
const PREFIXES = ['раз', 'не за', 'аккум', 'айфо', 'самсу', 'камер'];

const searchResults = new Trend('search_results');
const zeroResults = new Counter('search_zero_results');
const slugs = [];

export default function () {
  const roll = Math.random();
  const city = pick(CITIES);

  if (roll < 0.55) {
    group('search', () => {
      const res = http.get(`${API}/search?city=${city}&q=${encodeURIComponent(pick(QUERIES))}&limit=12`, { tags: { endpoint: 'search' } });
      const ok = check(res, { 'search 200': (r) => r.status === 200, 'есть интерпретация': (r) => r.json('interpretation') !== null });
      if (ok) {
        const items = res.json('items') || [];
        searchResults.add(items.length);
        if (items.length === 0) zeroResults.add(1);
        if (slugs.length < 200 && items[0]) slugs.push(items[0].slug);
      }
    });
  } else if (roll < 0.75) {
    group('suggest', () => {
      const res = http.get(`${API}/search/suggest?city=${city}&q=${encodeURIComponent(pick(PREFIXES))}`, { tags: { endpoint: 'suggest' } });
      check(res, { 'suggest 200': (r) => r.status === 200 });
    });
  } else if (roll < 0.9 && slugs.length) {
    group('master', () => {
      const res = http.get(`${API}/masters/${pick(slugs)}`, { tags: { endpoint: 'master' } });
      check(res, { 'master 200': (r) => r.status === 200 });
    });
  } else {
    group('map', () => {
      const res = http.get(`${API}/search/map?city=${city}&service=zamena-displeya`, { tags: { endpoint: 'map' } });
      check(res, { 'map 200': (r) => r.status === 200 });
    });
  }
}
