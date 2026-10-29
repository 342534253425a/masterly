import 'reflect-metadata';
import { createErasureAck, createGrpcClient, grpcAddress, JwtVerifier, loadConfig, runService } from '@masterly/platform';
import type { identity } from '@masterly/proto';
import { z } from 'zod';
import { MessagingModule } from './module.js';
import { RealtimeServer } from './realtime.js';

const config = loadConfig({
  GRPC_IDENTITY: z.string().optional(),
  JWT_ISSUER: z.string().default('https://id.masterly.local'),
  /** Порт WebSocket задаёт чарт (ports.http → HTTP_PORT), как у шлюза. */
  HTTP_PORT: z.coerce.number().int().default(8081),
  /** Origin сайта через запятую: https://masterly.ru — подключения с других сайтов отклоняются. */
  WS_ALLOWED_ORIGINS: z.string().default('http://localhost:3100'),
});

await runService({
  config,
  grpc: { package: 'masterly.messaging.v1', protoPath: 'masterly/messaging/v1/messaging.proto' },
  needs: { db: true, bus: true, kv: true, outbox: true, pubsub: true },
  module: (resources) => MessagingModule.register(resources, { erasureAck: createErasureAck('messaging', config.GRPC_IDENTITY) }),
  // Живой чат: WebSocket на отдельном порту; ingress направляет на него https://masterly.ru/ws
  attach: async (resources) => {
    if (!config.GRPC_IDENTITY) throw new Error('Не задана переменная окружения GRPC_IDENTITY (ключи JWT для WebSocket)');
    const identityClient = createGrpcClient<identity.IdentityServiceClient>({
      target: 'identity', address: grpcAddress(config.GRPC_IDENTITY), protoPath: 'masterly/identity/v1/identity.proto', package: 'masterly.identity.v1', service: 'IdentityService', idempotentMethods: ['getJwks'],
    });
    const verifier = new JwtVerifier(async () => (await identityClient.getJwks({})).jwksJson, config.JWT_ISSUER);
    const server = new RealtimeServer({
      port: config.HTTP_PORT,
      path: '/ws',
      allowedOrigins: config.WS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
      verify: (token) => verifier.verify(token),
      pubsub: resources.pubsub!,
      logger: resources.logger,
    });
    await server.start();
    return {
      close: async () => {
        await server.close();
        identityClient.close();
      },
    };
  },
});
