import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { KafkaJsInstrumentation } from '@opentelemetry/instrumentation-kafkajs';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { NodeSDK } from '@opentelemetry/sdk-node';

/**
 * OpenTelemetry подключается через `node --import ./dist/telemetry.js dist/main.js` — до загрузки модулей,
 * иначе автоинструментация не увидит http/grpc/pg/ioredis/kafkajs. Без OTEL_EXPORTER_OTLP_ENDPOINT — выключено.
 */
let sdk: NodeSDK | undefined;

export function startTelemetry(serviceName: string): void {
  if (sdk || process.env.OTEL_SDK_DISABLED === 'true' || !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => /^\/(health|metrics)/.test(req.url ?? '') }),
      new GrpcInstrumentation(),
      new PgInstrumentation({ enhancedDatabaseReporting: false }),
      new IORedisInstrumentation(),
      new KafkaJsInstrumentation(),
    ],
  });
  sdk.start();
}

/** Сбрасывает накопленные спаны при завершении (вызывается последним шагом graceful shutdown). */
export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown().catch(() => undefined);
  sdk = undefined;
}
