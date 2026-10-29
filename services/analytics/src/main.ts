import 'reflect-metadata';
import { createErasureAck, loadConfig, runService } from '@masterly/platform';
import { z } from 'zod';
import { AnalyticsModule } from './module.js';
import { ClickHouseWarehouse } from './warehouse.js';

const config = loadConfig({
  CLICKHOUSE_URL: z.string().url(),
  CLICKHOUSE_USER: z.string().optional(),
  CLICKHOUSE_PASSWORD: z.string().optional(),
  ANALYTICS_SALT: z.string().default('masterly-dev'),
  GRPC_IDENTITY: z.string().optional(),
});

const warehouse = new ClickHouseWarehouse(config.CLICKHOUSE_URL, 'analytics', config.CLICKHOUSE_USER ? { user: config.CLICKHOUSE_USER, password: config.CLICKHOUSE_PASSWORD ?? '' } : undefined);

await runService({
  config,
  grpc: { package: 'masterly.platform.v1', protoPath: 'masterly/platform/v1/platform.proto' },
  needs: { bus: true },
  module: (resources) => AnalyticsModule.register(resources, { warehouse, salt: config.ANALYTICS_SALT, erasureAck: createErasureAck('analytics', config.GRPC_IDENTITY) }),
});
