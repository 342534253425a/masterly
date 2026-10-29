import { api, buildPath, toQueryString, type Role } from '@masterly/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleMockRequest, resetDb } from './index.js';

const BASE = 'http://localhost:3000/api';
const cookies: Partial<Record<Role, string>> = {};

async function call(path: string, init: RequestInit & { role?: Role } = {}) {
  const headers = new Headers(init.headers);
  if (init.role && cookies[init.role]) headers.set('cookie', cookies[init.role]!);
  if (init.body) headers.set('content-type', 'application/json');
  const response = await handleMockRequest(new Request(`${BASE}${path}`, { ...init, headers }));
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

beforeAll(async () => {
  resetDb();
  for (const role of ['client', 'master', 'admin'] as const) {
    const response = await handleMockRequest(
      new Request(`${BASE}${api.demoLogin.path}`, { method: 'POST', body: JSON.stringify({ role }), headers: { 'content-type': 'application/json' } }),
    );
    cookies[role] = response.headers.get('set-cookie')!.split(';')[0]!;
  }
});

describe('mock API соответствует контрактам', () => {
  it('умный поиск понимает проблему, модель и ранжирует', async () => {
    const { status, body } = await call(`/v1/search${toQueryString({ q: 'разбил экран айфон 13 про', city: 'moskva' })}`);
    expect(status).toBe(200);
    expect(body.interpretation.services[0].id).toBe('display');
    expect(body.interpretation.model.id).toBe('iphone-13-pro');
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0].price.range.from).toBeGreaterThan(0);
  });

  it('публичные ручки', async () => {
    const searchResult = await call('/v1/search?city=sankt-peterburg&sort=price&openNow=false');
    const slug = searchResult.body.items[0].slug;
    const id = searchResult.body.items[0].id;
    for (const path of [
      '/v1/cities',
      '/v1/catalog/categories',
      '/v1/catalog/services?city=krasnodar',
      '/v1/catalog/brands',
      '/v1/catalog/models?brand=apple',
      '/v1/search/suggest?q=не%20заряжается',
      '/v1/search/map?city=moskva&service=zamena-displeya',
      buildPath(api.master.path, { slug }),
      buildPath(api.masterReviews.path, { id }) + '?sort=rating_asc',
      buildPath(api.similarMasters.path, { id }),
      `/v1/compare?ids=${searchResult.body.items.slice(0, 3).map((m: { id: string }) => m.id).join(',')}&service=zamena-displeya&model=iphone-15`,
      '/v1/seo/landing?city=moskva&service=zamena-displeya&model=iphone-13',
    ]) {
      const { status, body } = await call(path);
      expect(status, `${path}: ${JSON.stringify(body).slice(0, 300)}`).toBe(200);
    }
  });

  it('клиент: заявка → ответ мастера из кабинета → выбор → отзыв', async () => {
    const created = await call(api.createLead.path, {
      method: 'POST',
      role: 'client',
      headers: { 'Idempotency-Key': 'test-key-1' },
      body: JSON.stringify({ masterIds: [], broadcast: true, cityId: 'msk', serviceId: 'display', modelId: 'iphone-15', description: 'Разбил экран, нужна замена', urgency: 'today', visitType: 'workshop', preferredChannel: 'chat', sharePhone: false }),
    });
    expect(created.status).toBe(201);
    const leadId = created.body.id;

    const leads = await call(api.cabinetLeads.path, { role: 'master' });
    expect(leads.body.some((l: { id: string }) => l.id === leadId)).toBe(true);
    const responded = await call(buildPath(api.respondToLead.path, { id: leadId }), {
      method: 'POST',
      role: 'master',
      body: JSON.stringify({ priceFrom: 12900, priceTo: null, message: 'Сделаем за 40 минут', etaMin: 40 }),
    });
    expect(responded.status).toBe(200);

    const lead = await call(buildPath(api.lead.path, { id: leadId }), { role: 'client' });
    const responseId = lead.body.responses[0].id;
    const accepted = await call(buildPath(api.acceptResponse.path, { id: leadId, responseId }), { method: 'POST', role: 'client' });
    expect(accepted.body.status).toBe('accepted');
    await call(buildPath(api.completeLead.path, { id: leadId }), { method: 'POST', role: 'client' });
    const review = await call(api.createReview.path, { method: 'POST', role: 'client', body: JSON.stringify({ leadId, rating: 5, text: 'Отличный ремонт, всё работает как новое!' }) });
    expect(review.status).toBe(201);

    const repeat = await call(api.createLead.path, { method: 'POST', role: 'client', headers: { 'Idempotency-Key': 'test-key-1' }, body: created.body ? JSON.stringify({ masterIds: [], broadcast: true, cityId: 'msk', serviceId: 'display', modelId: null, description: 'Повтор той же заявки', urgency: 'today', visitType: 'workshop', preferredChannel: 'chat', sharePhone: false }) : '' });
    expect(repeat.body.id).toBe(leadId);
  });

  it('ручки клиента, мастера и админа отвечают по контракту', async () => {
    const byRole: Array<[Role, string[]]> = [
      ['client', ['/v1/auth/session', '/v1/me/settings', '/v1/me/favorites', '/v1/me/notifications', '/v1/leads', '/v1/conversations']],
      ['master', ['/v1/cabinet/overview', '/v1/cabinet/analytics?period=90d', '/v1/cabinet/profile', '/v1/cabinet/offers', '/v1/cabinet/schedule', '/v1/cabinet/leads', '/v1/cabinet/reviews', '/v1/cabinet/team', '/v1/cabinet/billing', '/v1/conversations']],
      ['admin', ['/v1/admin/overview', '/v1/admin/moderation', '/v1/admin/duplicates', '/v1/admin/catalog/services', '/v1/admin/catalog/categories', '/v1/admin/analytics/search-gaps', '/v1/admin/analytics/prices', '/v1/admin/users']],
    ];
    for (const [role, paths] of byRole) {
      for (const path of paths) {
        const { status, body } = await call(path, { role });
        expect(status, `${role} ${path}: ${JSON.stringify(body).slice(0, 300)}`).toBe(200);
      }
    }
    expect((await call('/v1/admin/overview', { role: 'client' })).status).toBe(403);
    expect((await call('/v1/leads')).status).toBe(401);
  });

  it('антифрод находит подмешанные дубликаты профилей', async () => {
    const { body } = await call('/v1/admin/duplicates', { role: 'admin' });
    expect(body.length).toBeGreaterThanOrEqual(3);
    expect(body[0].score).toBeGreaterThanOrEqual(0.55);
    const moderation = await call('/v1/admin/moderation', { role: 'admin' });
    expect(moderation.body[0].riskScore).toBeGreaterThan(0.6);
  });
});
