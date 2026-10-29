import { Controller, Inject, Injectable, Module, type DynamicModule, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DB, EVENT_BUS, LOGGER, PlatformModule, processOnce, type Db, type ErasureAck, type EventBus, type Logger, type PlatformResources } from '@masterly/platform';
import { leads } from '@masterly/proto';
import { LeadsService } from './leads.service.js';
import { ensureMonthlyPartitions } from './partitions.js';
import type { ContactsProvider, MasterMatcher } from './ports.js';
import { CONTACTS, ERASURE_ACK, MATCHER } from './tokens.js';

@Controller()
@leads.LeadsServiceControllerMethods()
export class LeadsController implements leads.LeadsServiceController {
  constructor(private readonly service: LeadsService) {}

  async createLead(request: leads.CreateLeadRequest): Promise<leads.CreateLeadResponse> {
    return { lead: await this.service.create(request) };
  }
  async getLead(request: leads.GetLeadRequest): Promise<leads.GetLeadResponse> {
    return { lead: await this.service.get(request.context, request.leadId) };
  }
  listClientLeads(request: leads.ListClientLeadsRequest): Promise<leads.ListClientLeadsResponse> {
    return this.service.listClient(request.context, request.page);
  }
  listMasterLeads(request: leads.ListMasterLeadsRequest): Promise<leads.ListMasterLeadsResponse> {
    return this.service.listMaster(request);
  }
  async respondToLead(request: leads.RespondToLeadRequest): Promise<leads.RespondToLeadResponse> {
    return { lead: await this.service.respond(request) };
  }
  async acceptResponse(request: leads.AcceptResponseRequest): Promise<leads.AcceptResponseResponse> {
    return { lead: await this.service.accept(request) };
  }
  async declineLead(request: leads.DeclineLeadRequest): Promise<leads.DeclineLeadResponse> {
    return { lead: await this.service.decline(request) };
  }
  async changeLeadStatus(request: leads.ChangeLeadStatusRequest): Promise<leads.ChangeLeadStatusResponse> {
    return { lead: await this.service.changeStatus(request) };
  }
  async cancelLead(request: leads.CancelLeadRequest): Promise<leads.CancelLeadResponse> {
    return { lead: await this.service.cancel(request) };
  }
  revealContacts(request: leads.RevealContactsRequest): Promise<leads.RevealContactsResponse> {
    return this.service.revealContacts(request);
  }
  async countClientLeads(request: leads.CountClientLeadsRequest): Promise<leads.CountClientLeadsResponse> {
    return { counts: await this.service.countClients(request.clientIds) };
  }
}

/** Удаление аккаунта клиента и фоновые задачи: истечение заявок, месячные секции. */
@Injectable()
export class LeadsWorkers implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(DB) private readonly db: Db,
    @Inject(ERASURE_ACK) private readonly ack: ErasureAck,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly service: LeadsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe('leads', {
      'identity.account.deletion_requested.v1': async (event) => {
        await processOnce(this.db, 'leads', event, (tx) => this.service.eraseClient(tx, event.payload.userId));
        await this.ack(event.payload.userId);
      },
    });
    const every = (ms: number, task: () => Promise<unknown>, name: string) => {
      const timer = setInterval(() => void task().catch((error: unknown) => this.logger.warn({ err: error }, `${name}: ошибка`)), ms);
      timer.unref();
      this.timers.push(timer);
    };
    every(60_000, () => this.service.expireDue(), 'истечение заявок');
    every(3_600_000, () => ensureMonthlyPartitions(this.db), 'секции заявок');
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearInterval(timer);
  }
}

export interface LeadsOptions {
  matcher: MasterMatcher;
  contacts: ContactsProvider;
  erasureAck: ErasureAck;
}

@Module({})
export class LeadsModule {
  static register(resources: PlatformResources, options: LeadsOptions): DynamicModule {
    return {
      module: LeadsModule,
      imports: [PlatformModule.forRoot(resources)],
      controllers: [LeadsController],
      providers: [
        LeadsService,
        LeadsWorkers,
        { provide: MATCHER, useValue: options.matcher },
        { provide: CONTACTS, useValue: options.contacts },
        { provide: ERASURE_ACK, useValue: options.erasureAck },
      ],
    };
  }
}
