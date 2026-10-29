import { Controller, Inject, Injectable, Module, type DynamicModule, type OnApplicationBootstrap } from '@nestjs/common';
import { EVENT_BUS, PlatformModule, type EventBus, type PlatformResources } from '@masterly/platform';
import { search } from '@masterly/proto';
import type { SearchIndex } from './index/types.js';
import { SearchService, toDoc } from './search.service.js';
import { SEARCH_INDEX } from './tokens.js';

@Controller()
@search.SearchServiceControllerMethods()
export class SearchController implements search.SearchServiceController {
  constructor(private readonly service: SearchService) {}

  searchMasters(request: search.SearchMastersRequest): Promise<search.SearchMastersResponse> {
    return this.service.search(request);
  }

  suggest(request: search.SuggestRequest): Promise<search.SuggestResponse> {
    return this.service.suggest(request);
  }

  mapPins(request: search.MapPinsRequest): Promise<search.MapPinsResponse> {
    return this.service.mapPins(request);
  }
}

/**
 * Read-модель живёт на событиях: снимки профилей (компактированный топик — полная пересборка с начала)
 * и рейтинги из отзывов. Идемпотентность — внешняя версия документа, inbox не нужен.
 */
@Injectable()
export class SearchConsumers implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(SEARCH_INDEX) private readonly index: SearchIndex,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe('search', {
      'catalog.master.upserted.v1': (event) => this.index.upsert(toDoc(event.payload)),
      'catalog.master.deleted.v1': (event) => this.index.remove(event.payload.masterId),
      'reviews.rating.aggregated.v1': (event) => this.index.updateRating(event.payload.masterId, event.payload.rating, event.payload.reviewsCount),
    });
  }
}

@Module({})
export class SearchModule {
  static register(resources: PlatformResources, options: { index: SearchIndex }): DynamicModule {
    return {
      module: SearchModule,
      imports: [PlatformModule.forRoot(resources)],
      controllers: [SearchController],
      providers: [SearchService, SearchConsumers, { provide: SEARCH_INDEX, useValue: options.index }],
    };
  }
}
