import { join } from 'node:path';
import type { Metadata, ServerUnaryCall } from '@grpc/grpc-js';
import {
  Catch,
  Injectable,
  type ArgumentsHost,
  type CallHandler,
  type ExecutionContext,
  type LoggerService,
  type NestInterceptor,
  type RpcExceptionFilter,
} from '@nestjs/common';
import type { GrpcOptions } from '@nestjs/microservices';
import { PROTO_DIR } from '@masterly/proto';
import type { Logger } from 'pino';
import { Observable, tap, throwError } from 'rxjs';
import { runWithContext } from '../context.js';
import { toAppError, toGrpcError } from '../errors.js';
import { metrics } from '../metrics.js';
import { PROTO_LOADER_OPTIONS } from './client.js';

export interface GrpcServiceSpec {
  /** Пакет protobuf, например masterly.catalog.v1. */
  package: string;
  /** Путь относительно каталога proto, например masterly/catalog/v1/catalog.proto. */
  protoPath: string;
}

export function grpcServerOptions(spec: GrpcServiceSpec, port: number): GrpcOptions['options'] {
  return {
    package: spec.package,
    protoPath: join(PROTO_DIR, spec.protoPath),
    url: `0.0.0.0:${port}`,
    loader: PROTO_LOADER_OPTIONS,
    gracefulShutdown: true,
    keepalive: { keepaliveTimeMs: 30_000, keepaliveTimeoutMs: 5_000 },
  };
}

/** Дедлайн и пользователь из метаданных → контекст запроса; метрики grpc_server_*. */
@Injectable()
export class GrpcObservabilityInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const method = context.getHandler().name;
    const metadata = context.switchToRpc().getContext<Metadata | undefined>();
    const call = context.getArgByIndex<ServerUnaryCall<unknown, unknown> | undefined>(2);
    const deadline = call?.getDeadline?.();
    const deadlineMs = deadline instanceof Date ? deadline.getTime() : typeof deadline === 'number' && Number.isFinite(deadline) ? deadline : undefined;
    const stop = metrics.grpcHandling.startTimer({ grpc_method: method });
    const record = (code: string) => {
      stop();
      metrics.grpcHandled.inc({ grpc_method: method, grpc_code: code });
    };
    return runWithContext(
      {
        deadline: deadlineMs,
        userId: metadata?.get('x-user-id')[0]?.toString() || undefined,
        roles: metadata?.get('x-user-roles')[0]?.toString().split(',').filter(Boolean),
      },
      () => next.handle(),
    ).pipe(tap({ complete: () => record('OK'), error: (error: unknown) => record(toAppError(error).code) }));
  }
}

/** AppError → статус gRPC + причина в trailing-метаданных (x-reason); неизвестное — INTERNAL с логом. */
@Catch()
export class GrpcExceptionFilter implements RpcExceptionFilter<unknown> {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, _host: ArgumentsHost): Observable<never> {
    const error = toAppError(exception);
    if (error.code === 'INTERNAL') this.logger.error({ err: exception }, 'необработанная ошибка в gRPC-обработчике');
    return throwError(() => toGrpcError(error));
  }
}

/** Логи NestJS → pino (единый формат JSON). */
export class NestPinoLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}
  log(message: unknown, context?: string) {
    this.logger.info({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string) {
    this.logger.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string) {
    this.logger.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string) {
    this.logger.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string) {
    this.logger.trace({ context }, String(message));
  }
  fatal(message: unknown, context?: string) {
    this.logger.fatal({ context }, String(message));
  }
}
