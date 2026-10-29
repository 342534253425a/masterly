import { stableId } from './prng.js';

export type DemoRole = 'client' | 'master' | 'admin';

export interface DemoAccount {
  id: string;
  role: DemoRole;
  name: string;
  phone: string;
  email: string;
  cityId: string;
}

/** Демо-аккаунты для портфолио: можно зайти за любую роль без регистрации. */
export const DEMO_ACCOUNTS: Record<DemoRole, DemoAccount> = {
  client: { id: stableId('user', 'client'), role: 'client', name: 'Алина Смирнова', phone: '+79161234567', email: 'alina@example.com', cityId: 'msk' },
  master: { id: stableId('user', 'master'), role: 'master', name: 'Алексей Морозов', phone: '+79037654321', email: 'master@example.com', cityId: 'msk' },
  admin: { id: stableId('user', 'admin'), role: 'admin', name: 'Ирина Котова', phone: '+79265550011', email: 'moderator@example.com', cityId: 'msk' },
};

/** Подсказки-примеры для умного поиска. */
export const EXAMPLE_QUERIES = [
  'разбил экран iPhone 13',
  'быстро садится Samsung A54',
  'не заряжается Redmi Note 13',
  'уронил в воду iPhone 15 Pro',
  'не работает Face ID',
  'треснуло стекло камеры Pixel 8',
];

/** Запросы без подходящих результатов — сигнал для расширения каталога. */
export const SEARCH_GAPS = [
  { query: 'ремонт ноутбука macbook', count: 141, trend: 0.18, categoryHint: 'laptops' },
  { query: 'ремонт apple watch', count: 112, trend: 0.09, categoryHint: 'smartwatches' },
  { query: 'замена экрана ipad', count: 96, trend: 0.22, categoryHint: 'tablets' },
  { query: 'ремонт наушников airpods', count: 74, trend: 0.05, categoryHint: 'audio' },
  { query: 'ремонт samsung tab s9', count: 41, trend: 0.11, categoryHint: 'tablets' },
  { query: 'замена стекла камеры pixel 8 pro', count: 37, trend: -0.04, categoryHint: 'smartphones' },
  { query: 'прошивка xiaomi pad 6', count: 22, trend: 0.02, categoryHint: 'tablets' },
  { query: 'ремонт телефона nokia 3310', count: 15, trend: -0.1, categoryHint: 'smartphones' },
] as const;
