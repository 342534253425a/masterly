import 'reflect-metadata';
import { createErasureAck, loadConfig, runService } from '@masterly/platform';
import { z } from 'zod';
import { ReviewsModule } from './module.js';

const config = loadConfig({ GRPC_IDENTITY: z.string().optional() });

await runService({
  config,
  grpc: { package: 'masterly.reviews.v1', protoPath: 'masterly/reviews/v1/reviews.proto' },
  needs: { db: true, bus: true, outbox: true },
  module: (resources) => ReviewsModule.register(resources, { erasureAck: createErasureAck('reviews', config.GRPC_IDENTITY) }),
});
