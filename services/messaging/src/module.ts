import { Controller, Inject, Injectable, Module, type DynamicModule, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DB, ensureMonthlyUuidPartitions, EVENT_BUS, PlatformModule, processOnce, type Db, type ErasureAck, type EventBus, type PlatformResources } from '@masterly/platform';
import { messaging } from '@masterly/proto';
import { MessagingService } from './messaging.service.js';
import { ChatNotifier, type ChatDelivery } from './realtime.js';

const ERASURE_ACK = 'messaging:erasure-ack';

@Controller()
@messaging.MessagingServiceControllerMethods()
export class MessagingController implements messaging.MessagingServiceController {
  constructor(private readonly service: MessagingService) {}

  async listConversations(request: messaging.ListConversationsRequest): Promise<messaging.ListConversationsResponse> {
    return { conversations: await this.service.list(request.context, request.page) };
  }
  listMessages(request: messaging.ListMessagesRequest): Promise<messaging.ListMessagesResponse> {
    return this.service.messages(request);
  }
  async sendMessage(request: messaging.SendMessageRequest): Promise<messaging.SendMessageResponse> {
    return { message: await this.service.send(request) };
  }
  async startConversation(request: messaging.StartConversationRequest): Promise<messaging.StartConversationResponse> {
    return { conversation: await this.service.start(request) };
  }
}

@Injectable()
export class MessagingWorkers implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(DB) private readonly db: Db,
    @Inject(ERASURE_ACK) private readonly ack: ErasureAck,
    private readonly service: MessagingService,
    private readonly notifier: ChatNotifier,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Сигнал в живой канал — только после фиксации транзакции и только при первой обработке события
    const once = <T>(effect: (tx: Parameters<Parameters<typeof processOnce>[3]>[0], payload: T) => Promise<ChatDelivery[]>) => async (event: { id: string; payload: T }) => {
      const deliveries: ChatDelivery[] = [];
      await processOnce(this.db, 'messaging', event, async (tx) => void deliveries.push(...(await effect(tx, event.payload))));
      await this.notifier.notify(deliveries);
    };
    await this.bus.subscribe('messaging', {
      'leads.lead.created.v1': once((tx, payload) => this.service.onLeadCreated(tx, payload)),
      'leads.lead.responded.v1': once((tx, payload) => this.service.onLeadResponded(tx, payload)),
      'leads.lead.status_changed.v1': once((tx, payload) => this.service.onLeadStatusChanged(tx, payload)),
      'identity.account.deletion_requested.v1': async (event) => {
        await processOnce(this.db, 'messaging', event, (tx) => this.service.eraseAuthor(tx, event.payload.userId));
        await this.ack(event.payload.userId);
      },
    });
    this.timer = setInterval(() => void ensureMonthlyUuidPartitions(this.db, ['messages']).catch(() => undefined), 3_600_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }
}

@Module({})
export class MessagingModule {
  static register(resources: PlatformResources, options: { erasureAck: ErasureAck }): DynamicModule {
    return {
      module: MessagingModule,
      imports: [PlatformModule.forRoot(resources)],
      controllers: [MessagingController],
      providers: [
        MessagingService,
        MessagingWorkers,
        { provide: ERASURE_ACK, useValue: options.erasureAck },
        { provide: ChatNotifier, useValue: new ChatNotifier(resources.pubsub, resources.logger) },
      ],
    };
  }
}
