import 'reflect-metadata';
import { assertProductionSecret, createErasureAck, createFieldCipher, DEV_FIELD_KEY, loadConfig, runService } from '@masterly/platform';
import { z } from 'zod';
import { CatalogModule } from './module.js';

const config = loadConfig({
  FIELD_ENCRYPTION_KEY: z.string().default(DEV_FIELD_KEY),
  PII_HMAC_KEY: z.string().default(DEV_FIELD_KEY),
  GRPC_IDENTITY: z.string().optional(),
  SEED_DEMO: z.stringbool().default(false),
});
assertProductionSecret(config.NODE_ENV, 'FIELD_ENCRYPTION_KEY', config.FIELD_ENCRYPTION_KEY);
assertProductionSecret(config.NODE_ENV, 'PII_HMAC_KEY', config.PII_HMAC_KEY);

await runService({
  config,
  grpc: { package: 'masterly.catalog.v1', protoPath: 'masterly/catalog/v1/catalog.proto' },
  needs: { db: true, bus: true, kv: true, outbox: true },
  module: (resources) =>
    CatalogModule.register(resources, {
      cipher: createFieldCipher(config.FIELD_ENCRYPTION_KEY, config.PII_HMAC_KEY),
      erasureAck: createErasureAck('catalog', config.GRPC_IDENTITY),
      seedDemo: config.SEED_DEMO,
    }),
});
