import { createHash } from 'node:crypto';
import type * as C from '@masterly/contracts';
import type { z } from 'zod';
import { BRANDS, brandById, CITIES, cityById, MODELS, modelById, serviceById } from '@masterly/fixtures';
import { uuidv7 } from '@masterly/kernel';
import { notFound, toRecord } from '@masterly/platform';
import { search as S } from '@masterly/proto';
import { REFRESH_COOKIE } from '../auth.js';
import * as dto from '../dto.js';
import { toMinor, type HandlerContext, type Handlers } from '../http.js';
import { brandOf, categoriesFor, cityDto, cityOf, modelOf, publicService, serviceOf, servicesFor } from './reference.js';
import { clearTokens, mastersById, setTokens, subjectOf } from './shared.js';

const SORTS: Record<C.SearchSort, S.Sort> = {
  relevance: S.Sort.SORT_RELEVANCE,
  price: S.Sort.SORT_PRICE,
  rating: S.Sort.SORT_RATING,
  distance: S.Sort.SORT_DISTANCE,
  response: S.Sort.SORT_RESPONSE,
};

function filtersOf(query: C.SearchQuery, ctx: HandlerContext): S.SearchFilters {
  return {
    query: query.q ?? '', cityId: cityOf(query.city, ctx), serviceId: serviceOf(query.service), modelId: modelOf(query.model), brandId: brandOf(query.brand),
    lat: query.lat, lng: query.lng, radiusKm: query.radiusKm, priceMaxMinor: toMinor(query.priceMax), ratingMin: query.ratingMin, warrantyMinDays: query.warrantyMin,
    openNow: !!query.openNow, verifiedOnly: !!query.verified, expressOnly: !!query.express, visitType: query.visit ?? '', parts: query.parts ?? '', acceptingLeadsOnly: false,
  };
}

function interpretation(query: string, value: S.Interpretation | undefined): C.Interpretation | null {
  if (!value || !query.trim()) return null;
  return {
    query,
    services: value.services.slice(0, 3).map((item) => ({ id: item.serviceId, name: serviceById.get(item.serviceId)?.name ?? item.serviceId, slug: serviceById.get(item.serviceId)?.slug ?? item.serviceId, score: item.score })),
    brand: value.brandId ? { id: value.brandId, name: brandById.get(value.brandId)?.name ?? value.brandId } : null,
    model: value.modelId ? { id: value.modelId, name: modelById.get(value.modelId)?.fullName ?? value.modelId } : null,
    urgent: value.urgent,
    confidence: Math.max(0, Math.min(1, value.confidence)),
    matchedTerms: value.matchedTerms,
    priceHint: null,
  };
}

export const publicHandlers: Handlers = {
  async cities(ctx) {
    return Promise.all(CITIES.map((city) => cityDto(ctx, city)));
  },

  async categories(ctx) {
    return (await categoriesFor(ctx)).map(({ services: _services, masters: _masters, ...category }): C.Category => category);
  },

  /** Цены «от» и медиана — из реальной матрицы цен catalog (кэш 10 минут); выключенные админкой услуги скрыты. */
  async services(ctx) {
    return (await servicesFor(ctx, cityOf(ctx.query.city, ctx))).map(publicService);
  },

  async brands() {
    return BRANDS.map((brand): C.Brand => ({ id: brand.id, slug: brand.slug, name: brand.name, popular: brand.popular, modelsCount: MODELS.filter((model) => model.brandId === brand.id).length }));
  },

  async models(ctx) {
    const brandId = brandOf(ctx.query.brand);
    const needle = String(ctx.query.q ?? '').trim().toLowerCase();
    return MODELS.filter((model) => (!brandId || model.brandId === brandId) && (!needle || model.fullName.toLowerCase().includes(needle))).map((model): C.DeviceModel => ({
      id: model.id, slug: model.slug, brandId: model.brandId, name: model.name, fullName: model.fullName, year: model.year, tier: model.tier,
    }));
  },

  async search(ctx) {
    const query = ctx.query as C.SearchQuery;
    const filters = filtersOf(query, ctx);
    const result = await ctx.backends.search.searchMasters({ filters, sort: SORTS[query.sort] ?? S.Sort.SORT_RELEVANCE, page: { cursor: query.cursor ?? '', limit: query.limit }, context: ctx.rpc() });
    const masters = await mastersById(ctx.backends, result.hits.map((hit) => hit.masterId));
    const top = result.interpretation?.services[0];
    // Та же логика, что в search: распознанная услуга применяется при уверенности ≥ 0,35
    const priceService = filters.serviceId || (top && (result.interpretation?.confidence ?? 0) >= 0.35 ? top.serviceId : '');
    const modelId = filters.modelId || result.interpretation?.modelId || null;
    const items = result.hits.flatMap((hit) => {
      const master = masters.get(hit.masterId);
      if (!master) return [];
      const price = hit.price && priceService ? { serviceId: priceService, modelId, fromMinor: hit.price.fromMinor, toMinor: hit.price.toMinor } : null;
      return [dto.masterCard(master, { distanceKm: hit.distanceKm ?? null, promoted: hit.promoted, price })];
    });
    const city = cityById.get(filters.cityId);
    return {
      searchId: result.searchId,
      items,
      total: result.page?.total ?? items.length,
      nextCursor: result.page?.nextCursor || null,
      interpretation: interpretation(query.q ?? '', result.interpretation),
      facets: {
        services: result.services.map((facet) => ({ id: facet.key, count: facet.count })),
        districts: result.districts.map((facet) => ({ id: facet.key, name: city?.districts.find((district) => district.id === facet.key)?.name ?? facet.key, count: facet.count })),
        priceHistogram: result.priceHistogram.map((bucket) => ({ from: dto.rub(bucket.fromMinor), to: dto.rub(bucket.toMinor), count: bucket.count })),
      },
      tookMs: result.tookMs,
    } satisfies C.SearchResponse;
  },

  async suggest(ctx) {
    const query = String(ctx.query.q ?? '');
    const result = await ctx.backends.search.suggest({ query, cityId: cityOf(ctx.query.city, ctx) });
    const types: Record<string, C.Suggestion['type']> = { query: 'problem', service: 'service', model: 'model', master: 'master' };
    return {
      suggestions: result.suggestions.map((item) => ({ type: types[item.type] ?? 'service', id: item.id, title: item.title, subtitle: item.subtitle || null, query: item.query })),
      interpretation: result.interpretation?.services.length ? interpretation(query, result.interpretation) : null,
    } satisfies C.SuggestResponse;
  },

  async mapPins(ctx) {
    const result = await ctx.backends.search.mapPins({ filters: filtersOf(ctx.query as C.SearchQuery, ctx), zoom: 14 });
    const pins = result.pins.map((pin) => ({
      id: pin.masterId, slug: pin.slug, name: pin.name, location: pin.location ?? { lat: 0, lng: 0 }, rating: pin.rating,
      price: pin.priceFromMinor !== undefined ? dto.rub(pin.priceFromMinor) : null, promoted: pin.promoted,
    }));
    return { pins, total: pins.length } satisfies C.MapResponse;
  },

  async master(ctx) {
    const { master } = await ctx.backends.catalog.getMaster({ slug: ctx.params.slug });
    if (!master) throw notFound('Мастер не найден');
    // Рейтинг из отзывов — необязательная часть: при недоступности reviews профиль всё равно открывается
    const rating = await ctx.backends.reviews.getRatingSummary({ masterId: master.id }).catch(() => undefined);
    return dto.masterProfile(master, rating, modelOf(ctx.query.model));
  },

  async masterReviews(ctx) {
    const query = ctx.query as z.output<typeof C.ReviewsQuery>;
    const sort = ({ recent: 'new', rating_desc: 'rating_high', rating_asc: 'rating_low', helpful: 'helpful' } as const)[query.sort];
    const page = await ctx.backends.reviews.listReviews({ masterId: ctx.params.id!, sort, rating: query.rating, withPhotos: !!query.withPhotos, page: { cursor: query.cursor ?? '', limit: query.limit } });
    return {
      items: page.reviews.map(dto.review),
      nextCursor: page.page?.nextCursor || null,
      total: page.page?.total ?? 0,
      distribution: page.distribution.length === 5 ? page.distribution : [0, 0, 0, 0, 0],
      rating: page.rating,
    } satisfies C.ReviewsPage;
  },

  async revealContacts(ctx) {
    const reveal = await ctx.backends.leads.revealContacts({ context: ctx.rpc(), masterId: ctx.params.id! });
    return { revealId: reveal.revealId, phone: reveal.phone, telegram: reveal.telegram || null, whatsapp: null, expiresAt: reveal.expiresAt } satisfies C.ContactReveal;
  },

  /** Сессия с тихим обновлением: истёкший access-токен меняется по refresh-cookie без повторного входа. */
  async session(ctx) {
    let userId = ctx.viewer?.userId;
    const refreshToken = ctx.cookies[REFRESH_COOKIE];
    if (!userId && refreshToken) {
      try {
        const { tokens } = await ctx.backends.identity.refreshSession({ refreshToken });
        setTokens(ctx, tokens!);
        userId = subjectOf(tokens!.accessToken);
      } catch {
        clearTokens(ctx);
      }
    }
    if (!userId) return { user: null, demo: false } satisfies C.Session;
    const { user } = await ctx.backends.identity.getUser({ userId });
    return { user: dto.user(user!), demo: false } satisfies C.Session;
  },

  async otpRequest(ctx) {
    const challenge = await ctx.backends.identity.requestOtp({ phone: String(ctx.body.phone), ipHash: ctx.rpc().ipHash, deviceId: '' });
    return { requestId: challenge.requestId, phoneMasked: challenge.phoneMasked, expiresInSec: challenge.expiresInSec, resendInSec: challenge.resendInSec, demoCode: null } satisfies C.OtpChallenge;
  },

  async otpVerify(ctx) {
    const userAgent = String(ctx.headers['user-agent'] ?? '');
    const result = await ctx.backends.identity.verifyOtp({ requestId: String(ctx.body.requestId), code: String(ctx.body.code), userAgent, ipHash: ctx.rpc().ipHash });
    setTokens(ctx, result.tokens!);
    return { user: dto.user(result.user!), demo: false } satisfies C.Session;
  },

  /** Демо-вход существует только в мок-режиме фронтенда (ADR-0012); в живом режиме его нет. */
  async demoLogin() {
    throw notFound('Демо-вход недоступен');
  },

  async logout(ctx) {
    const refreshToken = ctx.cookies[REFRESH_COOKIE];
    if (refreshToken) await ctx.backends.identity.revokeSession({ refreshToken, allDevices: false }).catch(() => undefined);
    clearTokens(ctx);
    return { ok: true as const };
  },

  /** Продуктовые события — прямо в Kafka (без ожидания): потеря части при сбое брокера допустима. */
  async track(ctx) {
    const viewer = ctx.viewer;
    const userHash = viewer ? createHash('sha256').update(`${ctx.settings.analyticsSalt}:${viewer.userId}`).digest('hex').slice(0, 32) : '';
    const events = (ctx.body.events as Array<{ name: string; props: Record<string, unknown>; ts: number }>) ?? [];
    const records = events.map((event) => {
      const props = Object.fromEntries(Object.entries(event.props).map(([key, value]) => [key, value === null ? '' : String(value)]));
      return toRecord('gateway', {
        type: 'analytics.product.tracked.v1',
        key: userHash || uuidv7(),
        payload: { name: event.name, userHash, masterId: props.master ?? '', searchId: props.search ?? '', props, at: new Date(event.ts || Date.now()).toISOString() },
      });
    });
    if (records.length && ctx.publish) void ctx.publish(records).catch(() => undefined);
    return { ok: true as const };
  },

  /** Публичный VAPID-ключ: без него браузер не подпишется на push; пустой ключ — push выключен в окружении. */
  async pushConfig(ctx) {
    const config = await ctx.backends.notifications.getPushConfig({});
    return { enabled: config.enabled, publicKey: config.enabled ? config.vapidPublicKey : null };
  },
};
