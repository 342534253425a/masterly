import { fileURLToPath } from 'node:url';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { createFieldCipher, createGrpcClient, DEV_FIELD_KEY, loadMigrations, OutboxRelay, type PromiseClient } from '@masterly/platform';
import { createTestResources, startTestMicroservice } from '@masterly/platform/testing';
import type { identity } from '@masterly/proto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityModule } from './module.js';

const spec = { package: 'masterly.identity.v1', protoPath: 'masterly/identity/v1/identity.proto' };

describe('identity', async () => {
  const resources = await createTestResources('identity', { migrations: await loadMigrations(fileURLToPath(new URL('../migrations', import.meta.url))) });
  const sms: Array<{ phone: string; text: string }> = [];
  let server: { address: string; close(): Promise<void> };
  let client: PromiseClient<identity.IdentityServiceClient> & { close(): void };
  const codeFor = (phone: string) => /(\d{6})/.exec(sms.filter((m) => m.phone === phone).at(-1)!.text)![1]!;
  const login = async (phone: string) => {
    const { requestId } = await client.requestOtp({ phone, ipHash: 'ip', deviceId: 'd1' });
    return client.verifyOtp({ requestId, code: codeFor(phone.replace(/\D/g, '').replace(/^8/, '7').replace(/^/, '+')), userAgent: 'vitest', ipHash: 'ip' });
  };

  beforeAll(async () => {
    const module = IdentityModule.register(resources, {
      cipher: createFieldCipher(DEV_FIELD_KEY),
      sms: { send: async (phone, text) => void sms.push({ phone, text }) },
      settings: { issuer: 'https://id.test', accessTtlSec: 900, refreshTtlSec: 3600, retentionDays: 1095 },
      seedDemo: true,
    });
    server = await startTestMicroservice(module, spec);
    client = createGrpcClient<identity.IdentityServiceClient>({ target: 'identity', address: server.address, ...spec, service: 'IdentityService', defaultDeadlineMs: 5_000 });
  });
  afterAll(async () => {
    client.close();
    await server.close();
    await resources.db.close();
  });

  it('OTP: неверный код считается попыткой, верный выдаёт токены, проверяемые по JWKS', async () => {
    const { requestId, phoneMasked } = await client.requestOtp({ phone: '8 (916) 111-22-33', ipHash: 'ip', deviceId: 'd1' });
    expect(phoneMasked).toContain('•');
    await expect(client.verifyOtp({ requestId, code: '000000', userAgent: '', ipHash: '' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', reason: 'otp_invalid' });
    const { user, tokens } = await client.verifyOtp({ requestId, code: codeFor('+79161112233'), userAgent: 'vitest', ipHash: 'ip' });
    expect(user!.roles).toEqual(['ROLE_CLIENT']);

    const { jwksJson } = await client.getJwks({});
    const { payload, protectedHeader } = await jwtVerify(tokens!.accessToken, createLocalJWKSet(JSON.parse(jwksJson)), { issuer: 'https://id.test', audience: 'masterly' });
    expect(protectedHeader.alg).toBe('EdDSA');
    expect(payload).toMatchObject({ sub: user!.id, roles: ['client'] });

    await expect(client.verifyOtp({ requestId, code: codeFor('+79161112233'), userAgent: '', ipHash: '' })).rejects.toMatchObject({ reason: 'otp_expired' });
  });

  it('повторный запрос кода — не чаще раза в минуту', async () => {
    await client.requestOtp({ phone: '+7 926 000-00-01', ipHash: 'ip', deviceId: 'd' });
    await expect(client.requestOtp({ phone: '+7 926 000-00-01', ipHash: 'ip', deviceId: 'd' })).rejects.toMatchObject({ code: 'RESOURCE_EXHAUSTED', reason: 'otp_cooldown' });
  });

  it('ротация refresh-токена и отзыв семейства при повторном использовании', async () => {
    const { tokens } = await login('+79265553311');
    const rotated = await client.refreshSession({ refreshToken: tokens!.refreshToken });
    expect(rotated.tokens!.refreshToken).not.toBe(tokens!.refreshToken);

    // Украденный старый токен: доступ закрывается для всей цепочки, включая свежий
    await expect(client.refreshSession({ refreshToken: tokens!.refreshToken })).rejects.toMatchObject({ code: 'UNAUTHENTICATED', reason: 'refresh_reused' });
    await expect(client.refreshSession({ refreshToken: rotated.tokens!.refreshToken })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('согласия: журнал изменений и событие ConsentChanged', async () => {
    const { user } = await login('+79265553322');
    const { consents } = await client.updateConsents({ userId: user!.id, consents: { analytics: true, personalization: false, marketing: false, policyVersion: 2 } });
    expect(consents).toMatchObject({ analytics: true, policyVersion: 2 });
    const log = await resources.db.query<{ purpose: string; granted: boolean }>('SELECT purpose, granted FROM consent_log WHERE user_id = $1', [user!.id]);
    expect(log.rows).toEqual([{ purpose: 'analytics', granted: true }]);
    await new OutboxRelay(resources.db, resources.bus, resources.logger).tick();
    expect(resources.bus.events('identity.account.consent_changed.v1').at(-1)).toMatchObject({ userId: user!.id, analytics: true });
  });

  it('удаление аккаунта: сессии закрыты, номер освобождён, событие для сервисов-владельцев', async () => {
    const { user, tokens } = await login('+79265553333');
    const { scheduledAt } = await client.deleteAccount({ userId: user!.id });
    expect(new Date(scheduledAt).getTime()).toBeGreaterThan(Date.now() + 365 * 86_400_000);
    await expect(client.refreshSession({ refreshToken: tokens!.refreshToken })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    await new OutboxRelay(resources.db, resources.bus, resources.logger).tick();
    expect(resources.bus.events('identity.account.deletion_requested.v1').at(-1)).toMatchObject({ userId: user!.id, roles: ['ROLE_CLIENT'] });

    // Тот же номер можно зарегистрировать заново — это новый пользователь (минута ожидания повтора кода «прошла»)
    await resources.kv.del([`otp:cooldown:${createFieldCipher(DEV_FIELD_KEY).hash('+79265553333')}`]);
    const again = await login('+79265553333');
    expect(again.user!.id).not.toBe(user!.id);

    await client.acknowledgeErasure({ userId: user!.id, service: 'leads' });
    await client.acknowledgeErasure({ userId: user!.id, service: 'leads' });
    const acks = await resources.db.query('SELECT service FROM erasure_acks WHERE user_id = $1', [user!.id]);
    expect(acks.rowCount).toBe(1);
  });

  it('избранное, настройки и журнал согласий', async () => {
    const { user } = await login('+79265553344');
    const masterId = '0193f0c4-7a1e-7000-8000-00000000aaaa';
    await client.addFavorite({ userId: user!.id, masterId });
    await client.addFavorite({ userId: user!.id, masterId });
    expect((await client.listFavorites({ userId: user!.id })).masterIds).toEqual([masterId]);
    await client.removeFavorite({ userId: user!.id, masterId });
    expect((await client.listFavorites({ userId: user!.id })).masterIds).toEqual([]);

    await client.updateSettings({ userId: user!.id, settingsJson: JSON.stringify({ theme: 'dark', radiusKm: 5 }), cityId: 'spb' });
    const merged = await client.updateSettings({ userId: user!.id, settingsJson: JSON.stringify({ radiusKm: 10 }), cityId: '' });
    expect(JSON.parse(merged.settingsJson)).toEqual({ theme: 'dark', radiusKm: 10 });
    expect((await client.getSettings({ userId: user!.id })).cityId).toBe('spb');
    await expect(client.updateSettings({ userId: user!.id, settingsJson: '[1,2]', cityId: '' })).rejects.toMatchObject({ reason: 'settings_invalid' });

    await client.updateConsents({ userId: user!.id, consents: { analytics: true, personalization: true, marketing: false, policyVersion: 1 } });
    expect((await client.getConsentLog({ userId: user!.id })).entries.map((e) => `${e.purpose}:${e.granted}`)).toEqual(['analytics:true', 'personalization:true']);
  });

  it('админка: поиск по телефону и имени, роли и блокировка, контакты для уведомлений', async () => {
    const byPhone = await client.listUsers({ query: '8 (903) 765-43-21', limit: 10 });
    expect(byPhone.users.map((u) => u.user!.name)).toEqual(['Алексей Морозов']);
    const byName = await client.listUsers({ query: 'ири', limit: 10 });
    expect(byName.users.map((u) => u.user!.name)).toEqual(['Ирина Котова']);

    const { user, tokens } = await login('+79265553355');
    const blocked = await client.updateUser({ userId: user!.id, roles: [], status: 'blocked' });
    expect(blocked.user!.user!.status).toBe('blocked');
    await expect(client.refreshSession({ refreshToken: tokens!.refreshToken })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    const promoted = await client.updateUser({ userId: user!.id, roles: ['ROLE_CLIENT' as never, 'ROLE_MASTER' as never], status: 'active' });
    expect(promoted.user!.user!.roles).toEqual(['ROLE_CLIENT', 'ROLE_MASTER']);

    const contacts = await client.getUserContacts({ userId: '01000000-0000-7000-8000-000000000000' }).catch((error: { code: string }) => error);
    expect(contacts).toMatchObject({ code: 'UNAUTHENTICATED' });
    const demoClient = (await client.listUsers({ query: '+79161234567', limit: 1 })).users[0]!.user!;
    expect(await client.getUserContacts({ userId: demoClient.id })).toEqual({ email: 'alina@example.com', phone: '+79161234567', name: 'Алина Смирнова' });
  });

  it('демо-пользователи с ролями и привязкой мастерской', async () => {
    const { rows } = await resources.db.query<{ roles: string[]; master_id: string | null }>('SELECT roles, master_id FROM users WHERE master_id IS NOT NULL');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.master_id).toBeTruthy();
  });
});
