import { Controller, Inject, Injectable, Module, type DynamicModule, type OnApplicationBootstrap } from '@nestjs/common';
import { DEMO_ACCOUNTS, pickDemoMaster } from '@masterly/fixtures';
import { DB, PlatformModule, type Db, type FieldCipher, type Logger, type PlatformResources } from '@masterly/platform';
import { identity } from '@masterly/proto';
import { IdentityService, type IdentitySettings, type SmsSender } from './identity.service.js';
import { CIPHER, SETTINGS, SMS } from './tokens.js';

@Controller()
@identity.IdentityServiceControllerMethods()
export class IdentityController implements identity.IdentityServiceController {
  constructor(private readonly service: IdentityService) {}

  requestOtp(request: identity.RequestOtpRequest) {
    return this.service.requestOtp(request);
  }

  verifyOtp(request: identity.VerifyOtpRequest) {
    return this.service.verifyOtp(request);
  }

  async refreshSession(request: identity.RefreshSessionRequest): Promise<identity.RefreshSessionResponse> {
    return { tokens: await this.service.refresh(request.refreshToken) };
  }

  async revokeSession(request: identity.RevokeSessionRequest): Promise<identity.RevokeSessionResponse> {
    await this.service.revoke(request.refreshToken, request.allDevices);
    return {};
  }

  async getUser(request: identity.GetUserRequest): Promise<identity.GetUserResponse> {
    return { user: await this.service.getUser(request.userId) };
  }

  async getJwks(): Promise<identity.GetJwksResponse> {
    return { jwksJson: await this.service.jwks() };
  }

  async deleteAccount(request: identity.DeleteAccountRequest): Promise<identity.DeleteAccountResponse> {
    return { scheduledAt: await this.service.deleteAccount(request.userId) };
  }

  async updateConsents(request: identity.UpdateConsentsRequest): Promise<identity.UpdateConsentsResponse> {
    if (!request.consents) return { consents: undefined };
    return { consents: await this.service.updateConsents(request.userId, request.consents) };
  }

  async acknowledgeErasure(request: identity.AcknowledgeErasureRequest): Promise<identity.AcknowledgeErasureResponse> {
    await this.service.acknowledgeErasure(request.userId, request.service);
    return {};
  }

  getSettings(request: identity.GetSettingsRequest): Promise<identity.GetSettingsResponse> {
    return this.service.userSettings(request.userId);
  }

  updateSettings(request: identity.UpdateSettingsRequest): Promise<identity.UpdateSettingsResponse> {
    return this.service.updateSettings(request.userId, request.settingsJson, request.cityId);
  }

  async listFavorites(request: identity.ListFavoritesRequest): Promise<identity.ListFavoritesResponse> {
    return { masterIds: await this.service.favorites(request.userId) };
  }

  async addFavorite(request: identity.AddFavoriteRequest): Promise<identity.AddFavoriteResponse> {
    await this.service.addFavorite(request.userId, request.masterId);
    return {};
  }

  async removeFavorite(request: identity.RemoveFavoriteRequest): Promise<identity.RemoveFavoriteResponse> {
    await this.service.removeFavorite(request.userId, request.masterId);
    return {};
  }

  async getConsentLog(request: identity.GetConsentLogRequest): Promise<identity.GetConsentLogResponse> {
    return { entries: await this.service.consentLog(request.userId) };
  }

  async listUsers(request: identity.ListUsersRequest): Promise<identity.ListUsersResponse> {
    return { users: await this.service.listUsers(request.query, request.limit) };
  }

  async updateUser(request: identity.UpdateUserRequest): Promise<identity.UpdateUserResponse> {
    return { user: await this.service.updateUser(request.userId, request.roles, request.status) };
  }

  getUserContacts(request: identity.GetUserContactsRequest): Promise<identity.GetUserContactsResponse> {
    return this.service.contacts(request.userId);
  }
}

/** Демо-пользователи локального стека — те же, что у кнопки «Демо-режим» во фронтенде. */
@Injectable()
export class DemoUsersSeeder implements OnApplicationBootstrap {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CIPHER) private readonly cipher: FieldCipher,
    @Inject('identity:seed-demo') private readonly enabled: boolean,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) return;
    for (const account of Object.values(DEMO_ACCOUNTS)) {
      await this.db.query('INSERT INTO users (id, phone_enc, phone_hash, email_enc, email_hash, name, roles, master_id, city_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING', [
        account.id, this.cipher.encrypt(account.phone), this.cipher.hash(account.phone), this.cipher.encrypt(account.email), this.cipher.hash(account.email),
        account.name, account.role === 'client' ? ['client'] : [account.role, 'client'], account.role === 'master' ? pickDemoMaster().id : null, account.cityId,
      ]);
    }
  }
}

export interface IdentityOptions {
  cipher: FieldCipher;
  sms: SmsSender;
  settings: IdentitySettings;
  seedDemo: boolean;
}

@Module({})
export class IdentityModule {
  static register(resources: PlatformResources, options: IdentityOptions): DynamicModule {
    return {
      module: IdentityModule,
      imports: [PlatformModule.forRoot(resources)],
      controllers: [IdentityController],
      providers: [
        IdentityService,
        DemoUsersSeeder,
        { provide: CIPHER, useValue: options.cipher },
        { provide: SMS, useValue: options.sms },
        { provide: SETTINGS, useValue: options.settings },
        { provide: 'identity:seed-demo', useValue: options.seedDemo },
      ],
    };
  }
}

/** SMS в логи — только для разработки: в production нужен провайдер (SMS_PROVIDER_URL). */
export class LogSmsSender implements SmsSender {
  constructor(private readonly logger: Logger) {}
  async send(phone: string, text: string): Promise<void> {
    this.logger.info({ to: `${phone.slice(0, 5)}…${phone.slice(-2)}`, text }, 'SMS (dev)');
  }
}

/** Универсальный HTTP-шлюз SMS: POST {to, text} с bearer-токеном, таймаут 3 с. */
export class HttpSmsSender implements SmsSender {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}
  async send(phone: string, text: string): Promise<void> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ to: phone, text }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new Error(`SMS-шлюз ответил ${response.status}`);
  }
}
