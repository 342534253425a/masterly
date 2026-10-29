import { z } from 'zod';
import { Problem } from './common.js';
import { api, type RouteSpec } from './routes.js';

type JsonSchema = Record<string, unknown>;

const toJson = (schema: z.ZodType, io: 'input' | 'output'): JsonSchema =>
  z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as JsonSchema;

function parameters(spec: RouteSpec) {
  const result: JsonSchema[] = [];
  for (const [location, object] of [['path', spec.params], ['query', spec.query]] as const) {
    if (!object) continue;
    for (const [name, field] of Object.entries(object.shape as Record<string, z.ZodType>)) {
      result.push({
        name,
        in: location,
        required: location === 'path' || !field.safeParse(undefined).success,
        schema: toJson(field, 'input'),
      });
    }
  }
  return result;
}

/** OpenAPI 3.1 строится из того же реестра, что использует фронтенд — документация не расходится с кодом. */
export function buildOpenApiDocument(info: { title: string; version: string; serverUrl: string }) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [operationId, spec] of Object.entries(api) as Array<[string, RouteSpec]>) {
    const operation: Record<string, unknown> = {
      operationId,
      summary: spec.summary,
      tags: spec.tags,
      security: spec.access === 'public' ? [] : [{ cookieAuth: [] }],
      'x-access': spec.access,
      parameters: [
        ...parameters(spec),
        ...(spec.idempotent ? [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', format: 'uuid' } }] : []),
      ],
      responses: {
        [String(spec.status ?? 200)]: { description: 'OK', content: { 'application/json': { schema: toJson(spec.response, 'output') } } },
        default: { description: 'Ошибка (RFC 9457)', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
      },
    };
    if (spec.body) operation.requestBody = { required: true, content: { 'application/json': { schema: toJson(spec.body, 'input') } } };
    if (spec.rateLimit) operation['x-rate-limit'] = spec.rateLimit;
    if (spec.cache) operation['x-cache'] = spec.cache;
    (paths[spec.path] ??= {})[spec.method.toLowerCase()] = operation;
  }
  return {
    openapi: '3.1.0',
    info: { title: info.title, version: info.version, description: 'Masterly Public API. Платформа не принимает платежи: все расчёты — напрямую с мастером.' },
    servers: [{ url: info.serverUrl }],
    paths,
    components: {
      securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'mly_at' } },
      schemas: { Problem: toJson(Problem, 'output') },
    },
  };
}
