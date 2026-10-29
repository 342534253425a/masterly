import { describe, expect, it } from 'vitest';
import { api, buildOpenApiDocument, buildPath, matchPath, SearchQuery, toQueryString } from './index.js';

describe('route registry', () => {
  it('строит и сопоставляет пути', () => {
    expect(buildPath(api.master.path, { slug: 'ifix-lab' })).toBe('/v1/masters/ifix-lab');
    expect(matchPath(api.acceptResponse.path, '/v1/leads/l1/responses/r2/accept')).toEqual({ id: 'l1', responseId: 'r2' });
    expect(matchPath(api.master.path, '/v1/masters')).toBeNull();
    expect(toQueryString({ q: 'экран', openNow: true, empty: '' })).toBe('?q=%D1%8D%D0%BA%D1%80%D0%B0%D0%BD&openNow=true');
  });

  it('парсит строковые query-параметры', () => {
    const parsed = SearchQuery.parse({ q: 'экран', openNow: 'true', priceMax: '5000' });
    expect(parsed).toMatchObject({ openNow: true, priceMax: 5000, sort: 'relevance', limit: 20 });
  });

  it('генерирует OpenAPI 3.1 для всех маршрутов', () => {
    const doc = buildOpenApiDocument({ title: 'Masterly', version: '1', serverUrl: 'https://api.example.com' });
    const operations = Object.values(doc.paths).flatMap((methods) => Object.keys(methods));
    expect(operations.length).toBe(Object.keys(api).length);
    expect(doc.openapi).toBe('3.1.0');
  });
});

describe('архитектурные ограничения (fitness functions)', () => {
  // ADR-0009: платформа не принимает платежей — в контрактах нет платёжных данных и маршрутов оплаты
  it('в API нет платёжных данных и маршрутов оплаты', () => {
    const doc = buildOpenApiDocument({ title: 'Masterly', version: '1', serverUrl: 'https://api.example.com' });
    const properties = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === 'properties' && value && typeof value === 'object') Object.keys(value).forEach((name) => properties.add(name));
        walk(value);
      }
    };
    walk(doc);

    // paymentMethods допустим: это справочное перечисление «как мастер принимает оплату на месте» (наличные, карта, СБП)
    const forbiddenField = /^(pan|cvv2?|cvc|iban)$|card.?(number|holder|expir|token)|bank.?card|payment.?token/i;
    expect([...properties].filter((name) => forbiddenField.test(name))).toEqual([]);
    expect(Object.keys(doc.paths).filter((path) => /\/(pay|payments?|checkout|acquiring)(\/|$)/i.test(path))).toEqual([]);
    expect(properties.size).toBeGreaterThan(50); // обход действительно видит схемы
  });
});
