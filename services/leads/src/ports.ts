import { createGrpcClient, grpcAddress } from '@masterly/platform';
import { search, type catalog } from '@masterly/proto';

/** Подбор получателей заявки (search). */
export interface MasterMatcher {
  match(criteria: { cityId: string; serviceId: string; modelId: string; limit: number }): Promise<string[]>;
}

/** Контакты и политика их показа (catalog). */
export interface ContactsProvider {
  contacts(masterId: string): Promise<{ phone: string; telegram: string; policy: string }>;
}

export function grpcMatcher(address: string): MasterMatcher {
  const client = createGrpcClient<search.SearchServiceClient>({
    target: 'search', address: grpcAddress(address), protoPath: 'masterly/search/v1/search.proto', package: 'masterly.search.v1', service: 'SearchService',
    defaultDeadlineMs: 400, idempotentMethods: ['searchMasters'],
  });
  return {
    async match({ cityId, serviceId, modelId, limit }) {
      const response = await client.searchMasters({
        filters: { query: '', cityId, serviceId, modelId, brandId: '', openNow: false, verifiedOnly: false, expressOnly: false, visitType: '', parts: '', acceptingLeadsOnly: true },
        sort: search.Sort.SORT_RELEVANCE,
        page: { cursor: '', limit },
        context: undefined,
      });
      return response.hits.filter((hit) => !hit.promoted).map((hit) => hit.masterId);
    },
  };
}

export function grpcContacts(address: string): ContactsProvider {
  const client = createGrpcClient<catalog.CatalogServiceClient>({
    target: 'catalog', address: grpcAddress(address), protoPath: 'masterly/catalog/v1/catalog.proto', package: 'masterly.catalog.v1', service: 'CatalogService',
    defaultDeadlineMs: 300, idempotentMethods: ['getMasterContacts'],
  });
  return { contacts: (masterId) => client.getMasterContacts({ masterId }) };
}
