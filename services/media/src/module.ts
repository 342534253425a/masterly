import { Controller, Inject, Injectable, Module, type DynamicModule, type OnApplicationBootstrap } from '@nestjs/common';
import { DB, EVENT_BUS, PlatformModule, processOnce, type Db, type ErasureAck, type EventBus, type PlatformResources } from '@masterly/platform';
import { platform } from '@masterly/proto';
import { MediaService, STORE } from './media.service.js';
import type { ObjectStore } from './s3.js';

const ERASURE_ACK = 'media:erasure-ack';

@Controller()
@platform.MediaServiceControllerMethods()
export class MediaController implements platform.MediaServiceController {
  constructor(private readonly service: MediaService) {}

  createUpload(request: platform.CreateUploadRequest): Promise<platform.CreateUploadResponse> {
    return this.service.createUpload(request);
  }
  completeUpload(request: platform.CompleteUploadRequest): Promise<platform.CompleteUploadResponse> {
    return this.service.completeUpload(request);
  }
}

@Injectable()
export class MediaConsumers implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(DB) private readonly db: Db,
    @Inject(ERASURE_ACK) private readonly ack: ErasureAck,
    private readonly service: MediaService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe('media', {
      'identity.account.deletion_requested.v1': async (event) => {
        await processOnce(this.db, 'media', event, (tx) => this.service.eraseOwner(tx, event.payload.userId));
        await this.ack(event.payload.userId);
      },
    });
  }
}

@Module({})
export class MediaModule {
  static register(resources: PlatformResources, options: { store: ObjectStore; erasureAck: ErasureAck }): DynamicModule {
    return {
      module: MediaModule,
      imports: [PlatformModule.forRoot(resources)],
      controllers: [MediaController],
      providers: [MediaService, MediaConsumers, { provide: STORE, useValue: options.store }, { provide: ERASURE_ACK, useValue: options.erasureAck }],
    };
  }
}
