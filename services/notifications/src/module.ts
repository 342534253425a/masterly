import { Controller, Inject, Injectable, Module, type DynamicModule, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DB, EVENT_BUS, LOGGER, PlatformModule, processOnce, type Db, type ErasureAck, type EventBus, type EventHandler, type EventType, type Logger, type PlatformResources } from '@masterly/platform';
import { platform } from '@masterly/proto';
import { NotificationsService, type ChannelSender } from './notifications.service.js';
import { ERASURE_ACK, PUSH, SENDER } from './tokens.js';

@Controller()
@platform.NotificationsServiceControllerMethods()
export class NotificationsController implements platform.NotificationsServiceController {
  constructor(
    private readonly service: NotificationsService,
    @Inject(PUSH) private readonly push: { publicKey: string },
  ) {}

  async listInbox(request: platform.ListInboxRequest): Promise<platform.ListInboxResponse> {
    return { notifications: await this.service.inbox(request.context) };
  }
  async markAllRead(request: platform.MarkAllReadRequest): Promise<platform.MarkAllReadResponse> {
    await this.service.markAllRead(request.context);
    return {};
  }
  async getPreferences(request: platform.GetPreferencesRequest): Promise<platform.GetPreferencesResponse> {
    return { preferences: await this.service.preferences(request.context) };
  }
  async updatePreferences(request: platform.UpdatePreferencesRequest): Promise<platform.UpdatePreferencesResponse> {
    return { preferences: await this.service.updatePreferences(request.context, request.preferences) };
  }
  async registerPushSubscription(request: platform.RegisterPushSubscriptionRequest): Promise<platform.RegisterPushSubscriptionResponse> {
    await this.service.registerPush(request);
    return {};
  }
  async unregisterPushSubscription(request: platform.UnregisterPushSubscriptionRequest): Promise<platform.UnregisterPushSubscriptionResponse> {
    await this.service.unregisterPush(request);
    return {};
  }
  async getPushConfig(): Promise<platform.GetPushConfigResponse> {
    return { vapidPublicKey: this.push.publicKey, enabled: this.push.publicKey !== '' };
  }
}

const NOTIFYING: EventType[] = ['leads.lead.created.v1', 'leads.lead.responded.v1', 'leads.lead.status_changed.v1', 'messaging.message.sent.v1', 'reviews.review.created.v1', 'trust.moderation.decided.v1'];

@Injectable()
export class NotificationsWorkers implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(DB) private readonly db: Db,
    @Inject(ERASURE_ACK) private readonly ack: ErasureAck,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly service: NotificationsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const notify: EventHandler<EventType> = async (event) => {
      await processOnce(this.db, 'notifications', event, (tx) => this.service.enqueue(tx, event.id, this.service.draftsFor(event)));
    };
    await this.bus.subscribe('notifications', {
      ...Object.fromEntries(NOTIFYING.map((type) => [type, notify])),
      'identity.account.deletion_requested.v1': async (event) => {
        await processOnce(this.db, 'notifications', event, (tx) => this.service.erase(tx, event.payload.userId));
        await this.ack(event.payload.userId);
      },
    });
    this.timer = setInterval(() => void this.dispatch(), 1_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  private async dispatch(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while ((await this.service.dispatchDue()) > 0);
    } catch (error) {
      this.logger.warn({ err: error }, 'рассылка уведомлений: ошибка');
    } finally {
      this.running = false;
    }
  }
}

@Module({})
export class NotificationsModule {
  static register(resources: PlatformResources, options: { sender: ChannelSender; erasureAck: ErasureAck; push?: { publicKey: string } }): DynamicModule {
    return {
      module: NotificationsModule,
      imports: [PlatformModule.forRoot(resources)],
      controllers: [NotificationsController],
      providers: [NotificationsService, NotificationsWorkers, { provide: SENDER, useValue: options.sender }, { provide: ERASURE_ACK, useValue: options.erasureAck }, { provide: PUSH, useValue: options.push ?? { publicKey: '' } }],
    };
  }
}
