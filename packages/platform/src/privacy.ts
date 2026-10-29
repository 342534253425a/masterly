import type { identity } from '@masterly/proto';
import { grpcAddress } from './config.js';
import { createGrpcClient } from './grpc/client.js';

/** Подтверждение исполнения удаления аккаунта сервисом-владельцем ПДн (ADR-0011). */
export type ErasureAck = (userId: string) => Promise<void>;

export function createErasureAck(service: string, identityAddress: string | undefined): ErasureAck {
  if (!identityAddress) return async () => undefined;
  const client = createGrpcClient<identity.IdentityServiceClient>({
    target: 'identity',
    address: grpcAddress(identityAddress),
    protoPath: 'masterly/identity/v1/identity.proto',
    package: 'masterly.identity.v1',
    service: 'IdentityService',
    defaultDeadlineMs: 2_000,
    idempotentMethods: ['acknowledgeErasure'],
  });
  return async (userId) => {
    await client.acknowledgeErasure({ userId, service });
  };
}
