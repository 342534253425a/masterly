import 'reflect-metadata';
import { createErasureAck, loadConfig, runService } from '@masterly/platform';
import { z } from 'zod';
import { LeadsModule } from './module.js';
import { grpcContacts, grpcMatcher } from './ports.js';

const config = loadConfig({
  GRPC_SEARCH: z.string().min(1),
  GRPC_CATALOG: z.string().min(1),
  GRPC_IDENTITY: z.string().optional(),
});

await runService({
  config,
  grpc: { package: 'masterly.leads.v1', protoPath: 'masterly/leads/v1/leads.proto' },
  needs: { db: true, bus: true, kv: true, outbox: true },
  module: (resources) =>
    LeadsModule.register(resources, {
      matcher: grpcMatcher(config.GRPC_SEARCH),
      contacts: grpcContacts(config.GRPC_CATALOG),
      erasureAck: createErasureAck('leads', config.GRPC_IDENTITY),
    }),
});
