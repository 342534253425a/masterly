import 'reflect-metadata';
import { createErasureAck, loadConfig, runService } from '@masterly/platform';
import { z } from 'zod';
import { MediaModule } from './module.js';
import { S3Store } from './s3.js';

const config = loadConfig({
  S3_ENDPOINT: z.string().url().default('https://storage.yandexcloud.net'),
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('ru-central1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  GRPC_IDENTITY: z.string().optional(),
});

const store = new S3Store({
  endpoint: config.S3_ENDPOINT,
  publicEndpoint: config.S3_PUBLIC_ENDPOINT,
  region: config.S3_REGION,
  bucket: config.S3_BUCKET,
  accessKeyId: config.S3_ACCESS_KEY_ID,
  secretAccessKey: config.S3_SECRET_ACCESS_KEY,
});

await runService({
  config,
  grpc: { package: 'masterly.platform.v1', protoPath: 'masterly/platform/v1/platform.proto' },
  needs: { db: true, bus: true, outbox: true },
  module: (resources) => MediaModule.register(resources, { store, erasureAck: createErasureAck('media', config.GRPC_IDENTITY) }),
});
