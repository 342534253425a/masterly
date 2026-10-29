import { trace } from '@opentelemetry/api';
import { pino, type Logger } from 'pino';

export type { Logger } from 'pino';

/** Пути, которые никогда не попадают в логи (первый рубеж; второй — redaction в OTel Collector). */
const REDACT = [
  'phone', '*.phone', 'email', '*.email', 'password', '*.password', 'token', '*.token', 'code', '*.code',
  'accessToken', '*.accessToken', 'refreshToken', '*.refreshToken', 'authorization', '*.authorization',
  'cookie', '*.cookie', 'req.headers.authorization', 'req.headers.cookie',
];

export function createLogger(options: { service: string; version?: string; level?: string }): Logger {
  return pino({
    level: options.level ?? 'info',
    base: { service: options.service, version: options.version },
    messageKey: 'msg',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: { paths: REDACT, censor: '[redacted]' },
    // Связь логов с трейсами: trace_id/span_id активного спана
    mixin() {
      const span = trace.getActiveSpan();
      if (!span) return {};
      const { traceId, spanId } = span.spanContext();
      return { trace_id: traceId, span_id: spanId };
    },
  });
}
