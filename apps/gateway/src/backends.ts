import { createGrpcClient, grpcAddress, type PromiseClient } from '@masterly/platform';
import type { catalog, identity, leads, messaging, platform, reviews, search } from '@masterly/proto';

/** Клиенты доменных сервисов. Идемпотентные чтения повторяются один раз в рамках бюджета повторов. */
export interface Backends {
  identity: PromiseClient<identity.IdentityServiceClient>;
  catalog: PromiseClient<catalog.CatalogServiceClient>;
  search: PromiseClient<search.SearchServiceClient>;
  leads: PromiseClient<leads.LeadsServiceClient>;
  reviews: PromiseClient<reviews.ReviewsServiceClient>;
  messaging: PromiseClient<messaging.MessagingServiceClient>;
  notifications: PromiseClient<platform.NotificationsServiceClient>;
  media: PromiseClient<platform.MediaServiceClient>;
  analytics: PromiseClient<platform.AnalyticsServiceClient>;
  trust: PromiseClient<platform.TrustServiceClient>;
}

export type BackendAddresses = Record<keyof Backends, string>;

const SPECS: Record<keyof Backends, { protoPath: string; package: string; service: string; idempotent: string[] }> = {
  identity: { protoPath: 'masterly/identity/v1/identity.proto', package: 'masterly.identity.v1', service: 'IdentityService', idempotent: ['getUser', 'getJwks', 'getSettings', 'listFavorites', 'getConsentLog', 'listUsers'] },
  catalog: { protoPath: 'masterly/catalog/v1/catalog.proto', package: 'masterly.catalog.v1', service: 'CatalogService', idempotent: ['getMaster', 'batchGetMasters', 'listServices', 'listDeviceModels', 'getPriceStats', 'listCategories', 'getBilling', 'getPlatformStats'] },
  search: { protoPath: 'masterly/search/v1/search.proto', package: 'masterly.search.v1', service: 'SearchService', idempotent: ['searchMasters', 'suggest', 'mapPins'] },
  leads: { protoPath: 'masterly/leads/v1/leads.proto', package: 'masterly.leads.v1', service: 'LeadsService', idempotent: ['getLead', 'listClientLeads', 'listMasterLeads', 'countClientLeads'] },
  reviews: { protoPath: 'masterly/reviews/v1/reviews.proto', package: 'masterly.reviews.v1', service: 'ReviewsService', idempotent: ['listReviews', 'getRatingSummary', 'listAuthorReviews'] },
  messaging: { protoPath: 'masterly/messaging/v1/messaging.proto', package: 'masterly.messaging.v1', service: 'MessagingService', idempotent: ['listConversations', 'listMessages'] },
  notifications: { protoPath: 'masterly/platform/v1/platform.proto', package: 'masterly.platform.v1', service: 'NotificationsService', idempotent: ['listInbox', 'getPreferences', 'getPushConfig'] },
  media: { protoPath: 'masterly/platform/v1/platform.proto', package: 'masterly.platform.v1', service: 'MediaService', idempotent: [] },
  analytics: { protoPath: 'masterly/platform/v1/platform.proto', package: 'masterly.platform.v1', service: 'AnalyticsService', idempotent: ['getMasterReport', 'getSearchGaps', 'getPlatformOverview'] },
  trust: { protoPath: 'masterly/platform/v1/platform.proto', package: 'masterly.platform.v1', service: 'TrustService', idempotent: ['listModerationItems', 'listDuplicateCandidates', 'getModerationStats'] },
};

export function createBackends(addresses: BackendAddresses): Backends & { close(): void } {
  const clients = Object.fromEntries(
    (Object.keys(SPECS) as Array<keyof Backends>).map((name) => {
      const spec = SPECS[name];
      return [name, createGrpcClient({ target: name, address: grpcAddress(addresses[name]), protoPath: spec.protoPath, package: spec.package, service: spec.service, idempotentMethods: spec.idempotent })];
    }),
  ) as unknown as Backends & Record<keyof Backends, { close(): void }>;
  return { ...clients, close: () => Object.values(clients).forEach((client) => (client as { close(): void }).close()) };
}
