import { createHash, createHmac } from 'node:crypto';

/** Хранилище объектов: S3 API (Yandex Object Storage, MinIO) в проде, память — в тестах. */
export interface ObjectStore {
  presignPut(key: string, contentType: string, expiresSec: number): { url: string; headers: Record<string, string> };
  get(key: string): Promise<Uint8Array | undefined>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface S3Options {
  endpoint: string;
  /** Адрес для ссылок, которые получит браузер (в Compose — localhost:9100 вместо minio:9000). */
  publicEndpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * Клиент S3 с подписью AWS Signature V4 (path-style): presigned PUT для браузера и подписанные запросы сервера.
 * Без AWS SDK — несколько десятков строк вместо мегабайт зависимостей в distroless-образе.
 */
export class S3Store implements ObjectStore {
  constructor(private readonly options: S3Options) {}

  presignPut(key: string, contentType: string, expiresSec: number) {
    const endpoint = new URL(this.options.publicEndpoint ?? this.options.endpoint);
    const { amzDate, scope, credential } = this.scope();
    const path = `/${this.options.bucket}/${key.split('/').map(encode).join('/')}`;
    const query: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresSec),
      'X-Amz-SignedHeaders': 'content-type;host',
    };
    const canonicalQuery = Object.keys(query).sort().map((name) => `${encode(name)}=${encode(query[name]!)}`).join('&');
    const canonical = ['PUT', path, canonicalQuery, `content-type:${contentType}\nhost:${endpoint.host}\n`, 'content-type;host', 'UNSIGNED-PAYLOAD'].join('\n');
    const signature = this.sign(scope, amzDate, canonical);
    return { url: `${endpoint.origin}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`, headers: { 'Content-Type': contentType } };
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    const response = await this.request('GET', key);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`S3 GET ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const response = await this.request('PUT', key, body, contentType);
    if (!response.ok) throw new Error(`S3 PUT ${response.status}`);
  }

  async delete(key: string): Promise<void> {
    const response = await this.request('DELETE', key);
    if (!response.ok && response.status !== 404) throw new Error(`S3 DELETE ${response.status}`);
  }

  private async request(method: string, key: string, body?: Uint8Array, contentType?: string): Promise<Response> {
    const endpoint = new URL(this.options.endpoint);
    const { amzDate, scope, credential } = this.scope();
    const path = `/${this.options.bucket}/${key.split('/').map(encode).join('/')}`;
    const payloadHash = sha256(body ?? '');
    const headers: Record<string, string> = { host: endpoint.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, ...(contentType ? { 'content-type': contentType } : {}) };
    const signed = Object.keys(headers).sort();
    const canonical = [method, path, '', signed.map((name) => `${name}:${headers[name]}\n`).join(''), signed.join(';'), payloadHash].join('\n');
    const authorization = `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signed.join(';')}, Signature=${this.sign(scope, amzDate, canonical)}`;
    const { host: _host, ...sendHeaders } = headers;
    return fetch(`${endpoint.origin}${path}`, { method, headers: { ...sendHeaders, authorization }, body: body ? Buffer.from(body) : undefined, signal: AbortSignal.timeout(15_000) });
  }

  private scope() {
    const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const scope = `${amzDate.slice(0, 8)}/${this.options.region}/s3/aws4_request`;
    return { amzDate, scope, credential: `${this.options.accessKeyId}/${scope}` };
  }

  private sign(scope: string, amzDate: string, canonical: string): string {
    const [date, region] = scope.split('/');
    const key = hmac(hmac(hmac(hmac(`AWS4${this.options.secretAccessKey}`, date!), region!), 's3'), 'aws4_request');
    return createHmac('sha256', key).update(['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n')).digest('hex');
  }
}

export class MemoryStore implements ObjectStore {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();
  presignPut(key: string, contentType: string) {
    return { url: `memory://${key}`, headers: { 'Content-Type': contentType } };
  }
  async get(key: string) {
    return this.objects.get(key)?.body;
  }
  async put(key: string, body: Uint8Array, contentType: string) {
    this.objects.set(key, { body, contentType });
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}
