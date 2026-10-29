import 'reflect-metadata';
import { loadConfig, runService } from '@masterly/platform';
import { z } from 'zod';
import { MemoryIndex } from './index/memory-index.js';
import { OpenSearchIndex } from './index/opensearch-index.js';
import { SearchModule } from './module.js';

const config = loadConfig({
  OPENSEARCH_URL: z.string().optional(),
  OPENSEARCH_ALIAS: z.string().default('masters'),
  ANALYTICS_SALT: z.string().default('masterly-dev'),
});

// Без OPENSEARCH_URL — индекс в памяти пода (локальная разработка): read-модель строится из тех же событий
const index = config.OPENSEARCH_URL ? new OpenSearchIndex(config.OPENSEARCH_URL, config.OPENSEARCH_ALIAS) : new MemoryIndex();

await runService({
  config,
  grpc: { package: 'masterly.search.v1', protoPath: 'masterly/search/v1/search.proto' },
  needs: { bus: true, kv: true },
  module: (resources) => SearchModule.register(resources, { index }),
});
