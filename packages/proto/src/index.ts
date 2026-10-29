import { fileURLToPath } from 'node:url';

/** Каталог .proto-файлов — для @grpc/proto-loader в NestJS-микросервисах. */
export const PROTO_DIR = fileURLToPath(new URL('../proto', import.meta.url));

export * as common from './gen/masterly/common/v1/common.js';
export * as events from './gen/masterly/events/v1/events.js';
export * as identity from './gen/masterly/identity/v1/identity.js';
export * as catalog from './gen/masterly/catalog/v1/catalog.js';
export * as search from './gen/masterly/search/v1/search.js';
export * as leads from './gen/masterly/leads/v1/leads.js';
export * as reviews from './gen/masterly/reviews/v1/reviews.js';
export * as messaging from './gen/masterly/messaging/v1/messaging.js';
export * as platform from './gen/masterly/platform/v1/platform.js';
