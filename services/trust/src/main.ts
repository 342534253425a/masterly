import 'reflect-metadata';
import { createErasureAck, loadConfig, runService } from '@masterly/platform';
import { z } from 'zod';
import { TrustModule } from './module.js';

const config = loadConfig({ GRPC_IDENTITY: z.string().optional() });

await runService({
  config,
  grpc: { package: 'masterly.platform.v1', protoPath: 'masterly/platform/v1/platform.proto' },
  needs: { db: true, bus: true, outbox: true },
  module: (resources) => TrustModule.register(resources, { erasureAck: createErasureAck('trust', config.GRPC_IDENTITY) }),
});
