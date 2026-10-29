import { fileURLToPath } from 'node:url';
import { uuidv7 } from '@masterly/kernel';
import { createGrpcClient, loadMigrations, OutboxRelay, toRecord, type PromiseClient } from '@masterly/platform';
import { createTestResources, startTestMicroservice } from '@masterly/platform/testing';
import type { platform } from '@masterly/proto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sniff, stripMetadata } from './images.js';
import { MediaModule } from './module.js';
import { MemoryStore, S3Store } from './s3.js';

const spec = { package: 'masterly.platform.v1', protoPath: 'masterly/platform/v1/platform.proto' };
const owner = uuidv7();
const context = { userId: owner, role: 'master', requestId: '', locale: 'ru', ipHash: '', masterId: '', name: '' };

/** Минимальный JPEG: SOI, APP1 c «Exif» и координатами, APP0, SOS с данными, EOI. */
function jpegWithExif(): Uint8Array {
  const exif = [...Buffer.from('Exif\0\0GPS 55.7558N 37.6173E')];
  const app1 = [0xff, 0xe1, 0x00, exif.length + 2, ...exif];
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0];
  return new Uint8Array([0xff, 0xd8, ...app1, ...app0, 0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9]);
}

describe('media', async () => {
  const resources = await createTestResources('media', { migrations: await loadMigrations(fileURLToPath(new URL('../migrations', import.meta.url))) });
  const store = new MemoryStore();
  const acks: string[] = [];
  let server: { address: string; close(): Promise<void> };
  let api: PromiseClient<platform.MediaServiceClient> & { close(): void };

  beforeAll(async () => {
    server = await startTestMicroservice(MediaModule.register(resources, { store, erasureAck: async (id) => void acks.push(id) }), spec);
    api = createGrpcClient<platform.MediaServiceClient>({ target: 'media', address: server.address, ...spec, service: 'MediaService', defaultDeadlineMs: 5_000 });
  });
  afterAll(async () => {
    api.close();
    await server.close();
    await resources.db.close();
  });

  it('метаданные с геопозицией удаляются, пиксельные данные остаются', () => {
    const original = jpegWithExif();
    const clean = stripMetadata(original, 'image/jpeg');
    expect(Buffer.from(original).includes('GPS')).toBe(true);
    expect(Buffer.from(clean).includes('GPS')).toBe(false);
    expect(Buffer.from(clean).includes('JFIF')).toBe(true);
    expect([...clean.slice(-7)]).toEqual([0x01, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9]);
    expect(sniff(clean)).toBe('image/jpeg');
    expect(sniff(new Uint8Array(Buffer.from('<?php echo 1;')))).toBeUndefined();
  });

  it('загрузка: presigned URL → проверка → чистый файл в постоянном ключе → событие', async () => {
    await expect(api.createUpload({ context, contentType: 'application/pdf', size: 100, purpose: 'portfolio' })).rejects.toMatchObject({ reason: 'unsupported_type' });
    const upload = await api.createUpload({ context, contentType: 'image/jpeg', size: 200, purpose: 'portfolio' });
    expect(upload.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    await expect(api.completeUpload({ context, uploadId: upload.uploadId })).rejects.toMatchObject({ reason: 'upload_missing' });

    await store.put(`tmp/portfolio/${upload.uploadId}`, jpegWithExif(), 'image/jpeg'); // так браузер загружает по presigned URL
    expect(await api.completeUpload({ context, uploadId: upload.uploadId })).toEqual({ assetId: upload.uploadId, status: 'ready' });
    const [key] = [...store.objects.keys()];
    expect(key).toBe(`portfolio/${owner}/${upload.uploadId}.jpg`);
    expect(Buffer.from(store.objects.get(key!)!.body).includes('GPS')).toBe(false);

    await new OutboxRelay(resources.db, resources.bus, resources.logger).tick();
    expect(resources.bus.events('media.asset.uploaded.v1')).toEqual([expect.objectContaining({ assetId: upload.uploadId, ownerId: owner, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) })]);
  });

  it('подмена содержимого отклоняется', async () => {
    const upload = await api.createUpload({ context, contentType: 'image/png', size: 50, purpose: 'chat' });
    await store.put(`tmp/chat/${upload.uploadId}`, new Uint8Array(Buffer.from('#!/bin/sh\nrm -rf /')), 'image/png');
    await expect(api.completeUpload({ context, uploadId: upload.uploadId })).rejects.toMatchObject({ reason: 'invalid_file' });
    expect(store.objects.has(`tmp/chat/${upload.uploadId}`)).toBe(false);
  });

  it('presigned PUT подписан по SigV4 на публичный адрес', () => {
    const s3 = new S3Store({ endpoint: 'http://minio:9000', publicEndpoint: 'http://localhost:9100', region: 'ru-central1', bucket: 'masterly-media', accessKeyId: 'AKID', secretAccessKey: 'secret' });
    const { url } = s3.presignPut('tmp/lead/abc', 'image/webp', 600);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('http://localhost:9100/masterly-media/tmp/lead/abc');
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
    expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('удаление аккаунта удаляет файлы пользователя', async () => {
    await resources.bus.publish([toRecord('identity', { type: 'identity.account.deletion_requested.v1', key: owner, payload: { userId: owner, requestedAt: '', retainUntil: '', roles: [] } })]);
    await resources.bus.drain();
    expect([...store.objects.keys()].filter((key) => key.includes(owner))).toEqual([]);
    expect(acks).toEqual([owner]);
  });
});
