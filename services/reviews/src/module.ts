import { Controller, Inject, Injectable, Module, type DynamicModule, type OnApplicationBootstrap } from '@nestjs/common';
import { DB, EVENT_BUS, PlatformModule, processOnce, type Db, type ErasureAck, type EventBus, type PlatformResources } from '@masterly/platform';
import { reviews } from '@masterly/proto';
import { ReviewsService } from './reviews.service.js';

const ERASURE_ACK = 'reviews:erasure-ack';

@Controller()
@reviews.ReviewsServiceControllerMethods()
export class ReviewsController implements reviews.ReviewsServiceController {
  constructor(private readonly service: ReviewsService) {}

  async createReview(request: reviews.CreateReviewRequest): Promise<reviews.CreateReviewResponse> {
    return { review: await this.service.create(request) };
  }
  listReviews(request: reviews.ListReviewsRequest): Promise<reviews.ListReviewsResponse> {
    return this.service.list(request);
  }
  async replyToReview(request: reviews.ReplyToReviewRequest): Promise<reviews.ReplyToReviewResponse> {
    return { review: await this.service.reply(request) };
  }
  getRatingSummary(request: reviews.GetRatingSummaryRequest): Promise<reviews.GetRatingSummaryResponse> {
    return this.service.summary(request.masterId);
  }
  async listAuthorReviews(request: reviews.ListAuthorReviewsRequest): Promise<reviews.ListAuthorReviewsResponse> {
    return { reviews: await this.service.byAuthor(request.authorId) };
  }
}

@Injectable()
export class ReviewsConsumers implements OnApplicationBootstrap {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(DB) private readonly db: Db,
    @Inject(ERASURE_ACK) private readonly ack: ErasureAck,
    private readonly service: ReviewsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe('reviews', {
      'leads.lead.created.v1': (event) => processOnce(this.db, 'reviews', event, (tx) => this.service.onLeadCreated(tx, event.payload)).then(() => undefined),
      'leads.lead.status_changed.v1': (event) => processOnce(this.db, 'reviews', event, (tx) => this.service.onLeadStatusChanged(tx, event.payload)).then(() => undefined),
      'trust.moderation.decided.v1': (event) => processOnce(this.db, 'reviews', event, (tx) => this.service.onModeration(tx, event.payload)).then(() => undefined),
      'identity.account.deletion_requested.v1': async (event) => {
        await processOnce(this.db, 'reviews', event, (tx) => this.service.eraseAuthor(tx, event.payload.userId));
        await this.ack(event.payload.userId);
      },
    });
  }
}

@Module({})
export class ReviewsModule {
  static register(resources: PlatformResources, options: { erasureAck: ErasureAck }): DynamicModule {
    return {
      module: ReviewsModule,
      imports: [PlatformModule.forRoot(resources)],
      controllers: [ReviewsController],
      providers: [ReviewsService, ReviewsConsumers, { provide: ERASURE_ACK, useValue: options.erasureAck }],
    };
  }
}
