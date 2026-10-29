import { Inject, Injectable, Module, type DynamicModule, type OnApplicationBootstrap } from '@nestjs/common';
import { DB, EVENT_BUS, LOGGER, PlatformModule, processOnce, type Db, type ErasureAck, type EventBus, type FieldCipher, type Logger, type PlatformResources } from '@masterly/platform';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { CatalogRepository } from './repository.js';
import { seedDemoMasters, seedReferenceData } from './seed.js';
import { CIPHER, ERASURE_ACK, SEED_DEMO } from './tokens.js';

/** Подписки: решения модерации и удаление аккаунтов применяет владелец данных. */
@Injectable()
export class CatalogConsumers implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(DB) private readonly db: Db,
    @Inject(ERASURE_ACK) private readonly ack: ErasureAck,
    private readonly catalog: CatalogService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe('catalog', {
      'trust.moderation.decided.v1': async (event) => {
        let affected: string[] = [];
        await processOnce(this.db, 'catalog', event, async (tx) => {
          affected = await this.catalog.applyModeration(tx, event.payload);
        });
        await this.catalog.forget(affected);
      },
      'identity.account.deletion_requested.v1': async (event) => {
        let affected: string[] = [];
        await processOnce(this.db, 'catalog', event, async (tx) => {
          affected = await this.catalog.eraseOwner(tx, event.payload.userId);
        });
        await this.catalog.forget(affected);
        await this.ack(event.payload.userId);
      },
    });
  }
}

@Injectable()
export class CatalogSeeder implements OnApplicationBootstrap {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CIPHER) private readonly cipher: FieldCipher,
    @Inject(SEED_DEMO) private readonly demo: boolean,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await seedReferenceData(this.db);
    if (!this.demo) return;
    const inserted = await seedDemoMasters(this.db, this.cipher);
    if (inserted > 0) this.logger.info({ masters: inserted }, 'демо-каталог загружен');
  }
}

export interface CatalogOptions {
  cipher: FieldCipher;
  erasureAck: ErasureAck;
  seedDemo: boolean;
}

@Module({})
export class CatalogModule {
  static register(resources: PlatformResources, options: CatalogOptions): DynamicModule {
    return {
      module: CatalogModule,
      imports: [PlatformModule.forRoot(resources)],
      controllers: [CatalogController],
      providers: [
        CatalogRepository,
        CatalogService,
        CatalogSeeder,
        CatalogConsumers,
        { provide: CIPHER, useValue: options.cipher },
        { provide: ERASURE_ACK, useValue: options.erasureAck },
        { provide: SEED_DEMO, useValue: options.seedDemo },
      ],
    };
  }
}

