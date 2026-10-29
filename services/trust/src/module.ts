import { Controller, Inject, Injectable, Module, type DynamicModule, type OnApplicationBootstrap } from '@nestjs/common';
import { DB, EVENT_BUS, PlatformModule, processOnce, type Db, type ErasureAck, type EventBus, type PlatformResources } from '@masterly/platform';
import { platform } from '@masterly/proto';
import { TrustService } from './trust.service.js';

const ERASURE_ACK = 'trust:erasure-ack';

@Controller()
@platform.TrustServiceControllerMethods()
export class TrustController implements platform.TrustServiceController {
  constructor(private readonly service: TrustService) {}

  async listModerationItems(request: platform.ListModerationItemsRequest): Promise<platform.ListModerationItemsResponse> {
    return { items: await this.service.listItems(request) };
  }
  async decideModeration(request: platform.DecideModerationRequest): Promise<platform.DecideModerationResponse> {
    return { item: await this.service.decideItem(request) };
  }
  async listDuplicateCandidates(request: platform.ListDuplicateCandidatesRequest): Promise<platform.ListDuplicateCandidatesResponse> {
    return { candidates: await this.service.listDuplicates(request.cityId) };
  }
  async resolveDuplicate(request: platform.ResolveDuplicateRequest): Promise<platform.ResolveDuplicateResponse> {
    return { candidate: await this.service.resolveDuplicate(request) };
  }
  async createReport(request: platform.CreateReportRequest): Promise<platform.CreateReportResponse> {
    return { id: await this.service.report(request) };
  }
  getModerationStats(): Promise<platform.GetModerationStatsResponse> {
    return this.service.moderationStats();
  }
}

@Injectable()
export class TrustConsumers implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(DB) private readonly db: Db,
    @Inject(ERASURE_ACK) private readonly ack: ErasureAck,
    private readonly service: TrustService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe('trust', {
      'catalog.master.upserted.v1': (event) => processOnce(this.db, 'trust', event, (tx) => this.service.onMasterUpserted(tx, event.payload)).then(() => undefined),
      'reviews.review.created.v1': (event) => processOnce(this.db, 'trust', event, (tx) => this.service.onReviewCreated(tx, event.payload)).then(() => undefined),
      'media.asset.uploaded.v1': (event) => processOnce(this.db, 'trust', event, (tx) => this.service.onMediaUploaded(tx, event.payload)).then(() => undefined),
      'identity.account.deletion_requested.v1': async (event) => {
        await processOnce(this.db, 'trust', event, (tx) => this.service.eraseAuthor(tx, event.payload.userId));
        await this.ack(event.payload.userId);
      },
    });
  }
}

@Module({})
export class TrustModule {
  static register(resources: PlatformResources, options: { erasureAck: ErasureAck }): DynamicModule {
    return {
      module: TrustModule,
      imports: [PlatformModule.forRoot(resources)],
      controllers: [TrustController],
      providers: [TrustService, TrustConsumers, { provide: ERASURE_ACK, useValue: options.erasureAck }],
    };
  }
}
