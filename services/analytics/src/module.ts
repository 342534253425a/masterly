import { createHash } from 'node:crypto';
import { Controller, Inject, Injectable, Module, type DynamicModule, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { EVENT_BUS, invalid, PlatformModule, unauthenticated, type ErasureAck, type EventBus, type PlatformResources } from '@masterly/platform';
import { platform } from '@masterly/proto';
import { BatchWriter } from './batch.js';
import type { Warehouse } from './warehouse.js';

const WAREHOUSE = 'analytics:warehouse';
const OPTIONS = 'analytics:options';

interface AnalyticsOptions {
  warehouse: Warehouse;
  /** Соль псевдонимов: та же, что у search, — иначе удаление по пользователю не найдёт его поиски. */
  salt: string;
  erasureAck: ErasureAck;
  /** Сколько ждать накопления пакета перед вставкой (по умолчанию 500 мс; в сквозных тестах — 0). */
  batchDelayMs?: number;
}

@Injectable()
export class AnalyticsService implements OnApplicationShutdown {
  readonly writer: BatchWriter;

  constructor(@Inject(OPTIONS) private readonly options: AnalyticsOptions) {
    this.writer = new BatchWriter(options.warehouse, 5_000, options.batchDelayMs ?? 500);
  }

  userHash(userId: string): string {
    return userId ? createHash('sha256').update(`${this.options.salt}:${userId}`).digest('hex').slice(0, 32) : '';
  }

  async track(request: platform.TrackEventsRequest): Promise<void> {
    if (!request.context?.userId) throw unauthenticated();
    if (request.events.length > 50) throw invalid('Не больше 50 событий за раз', 'too_many_events');
    const userHash = this.userHash(request.context.userId);
    await this.writer.add(
      'events',
      request.events.map((event) => ({
        ts: new Date(event.ts || Date.now()).toISOString(), name: event.name.slice(0, 64), user_hash: userHash, master_id: event.props.master ?? '', search_id: event.props.search ?? '',
        city_id: event.props.city ?? '', service_id: event.props.service ?? '', source: event.props.source ?? '', props: event.props,
      })),
    );
  }

  async report(request: platform.GetMasterReportRequest): Promise<platform.GetMasterReportResponse> {
    const days = Math.min(Math.max(request.days || 30, 1), 365);
    const report = await this.options.warehouse.masterReport(request.masterId, days);
    return { series: report.series, sources: report.sources, hours: report.hours, queries: report.queries };
  }

  async overview(request: platform.GetPlatformOverviewRequest): Promise<platform.GetPlatformOverviewResponse> {
    return this.options.warehouse.platformOverview(Math.min(Math.max(request.days || 30, 1), 365));
  }

  async gaps(request: platform.GetSearchGapsRequest): Promise<platform.GetSearchGapsResponse> {
    return { gaps: await this.options.warehouse.searchGaps(request.cityId, Math.min(request.days || 30, 365), Math.min(request.limit || 50, 500)) };
  }

  eraseUser(userId: string): Promise<void> {
    return this.options.warehouse.eraseUser(this.userHash(userId));
  }

  async onApplicationShutdown(): Promise<void> {
    await this.writer.flushAll();
  }
}

@Controller()
@platform.AnalyticsServiceControllerMethods()
export class AnalyticsController implements platform.AnalyticsServiceController {
  constructor(private readonly service: AnalyticsService) {}

  async trackEvents(request: platform.TrackEventsRequest): Promise<platform.TrackEventsResponse> {
    await this.service.track(request);
    return {};
  }
  getMasterReport(request: platform.GetMasterReportRequest): Promise<platform.GetMasterReportResponse> {
    return this.service.report(request);
  }
  getSearchGaps(request: platform.GetSearchGapsRequest): Promise<platform.GetSearchGapsResponse> {
    return this.service.gaps(request);
  }
  getPlatformOverview(request: platform.GetPlatformOverviewRequest): Promise<platform.GetPlatformOverviewResponse> {
    return this.service.overview(request);
  }
}

/**
 * Потоки в ClickHouse: поиски (с показами карточек), продуктовые события, факты заявок и раскрытий контактов.
 * Отзыв согласия и удаление аккаунта стирают данные пользователя по псевдониму.
 */
@Injectable()
export class AnalyticsConsumers implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(OPTIONS) private readonly options: AnalyticsOptions,
    private readonly service: AnalyticsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const writer = this.service.writer;
    await this.bus.subscribe('analytics', {
      'analytics.search.performed.v1': ({ payload: s }) =>
        writer.add('searches', [{ ts: s.at, search_id: s.searchId, query: s.query, city_id: s.cityId, service_id: s.serviceId, model_id: s.modelId, results_count: s.resultsCount, took_ms: s.tookMs, user_hash: s.userHash, shown_ids: s.shownMasterIds, promoted_ids: s.promotedMasterIds }]),
      'analytics.product.tracked.v1': ({ payload: e }) =>
        writer.add('events', [{ ts: e.at, name: e.name, user_hash: e.userHash, master_id: e.masterId, search_id: e.searchId, city_id: e.props.city ?? '', service_id: e.props.service ?? '', source: e.props.source ?? '', props: e.props }]),
      'leads.lead.created.v1': ({ payload: lead }) =>
        writer.add('events', lead.masterIds.map((masterId) => ({ ts: lead.createdAt || new Date().toISOString(), name: 'lead_created', user_hash: this.service.userHash(lead.clientId), master_id: masterId, search_id: '', city_id: lead.cityId, service_id: lead.serviceId, source: '', props: { lead: lead.leadId } }))),
      'leads.contact.revealed.v1': ({ payload: reveal }) =>
        writer.add('events', [{ ts: reveal.at || new Date().toISOString(), name: 'contact_reveal', user_hash: this.service.userHash(reveal.userId), master_id: reveal.masterId, search_id: '', city_id: '', service_id: '', source: '', props: {} }]),
      'identity.account.consent_changed.v1': async ({ payload }) => {
        if (!payload.analytics) await this.service.eraseUser(payload.userId);
      },
      'identity.account.deletion_requested.v1': async ({ payload }) => {
        await this.service.eraseUser(payload.userId);
        await this.options.erasureAck(payload.userId);
      },
    });
  }
}

@Module({})
export class AnalyticsModule {
  static register(resources: PlatformResources, options: AnalyticsOptions): DynamicModule {
    return {
      module: AnalyticsModule,
      imports: [PlatformModule.forRoot(resources)],
      controllers: [AnalyticsController],
      providers: [AnalyticsService, AnalyticsConsumers, { provide: OPTIONS, useValue: options }, { provide: WAREHOUSE, useValue: options.warehouse }],
    };
  }
}
