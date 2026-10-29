import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '@masterly/kernel';
import { conflict, DB, enqueue, invalid, notFound, unauthenticated, type Db, type Queryable } from '@masterly/platform';
import type { common, platform } from '@masterly/proto';
import { sniff, stripMetadata } from './images.js';
import type { ObjectStore } from './s3.js';

export const STORE = 'media:store';
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PURPOSES = ['portfolio', 'lead', 'review', 'chat', 'avatar', 'verification'];
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

interface AssetRow { id: string; owner_id: string; purpose: string; status: string; object_key: string; content_type: string; declared_size: number }

function ownerOf(context: common.RequestContext | undefined): string {
  if (!context?.userId) throw unauthenticated();
  return context.userId;
}

@Injectable()
export class MediaService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(STORE) private readonly store: ObjectStore,
  ) {}

  /** Шаг 1: браузер получает presigned PUT на временный ключ; сервер файл ещё не видел. */
  async createUpload(request: platform.CreateUploadRequest): Promise<platform.CreateUploadResponse> {
    const owner = ownerOf(request.context);
    if (!TYPES.includes(request.contentType)) throw invalid('Поддерживаются JPEG, PNG и WebP', 'unsupported_type');
    if (request.size <= 0 || request.size > MAX_BYTES) throw invalid('Файл до 10 МБ', 'too_large');
    if (!PURPOSES.includes(request.purpose)) throw invalid('Неизвестное назначение файла', 'invalid_purpose');
    const id = uuidv7();
    const key = `tmp/${request.purpose}/${id}`;
    await this.db.query('INSERT INTO assets (id, owner_id, purpose, object_key, content_type, declared_size) VALUES ($1, $2, $3, $4, $5, $6)', [id, owner, request.purpose, key, request.contentType, request.size]);
    const presigned = this.store.presignPut(key, request.contentType, 600);
    return { uploadId: id, url: presigned.url, headers: presigned.headers, expiresAt: new Date(Date.now() + 600_000).toISOString() };
  }

  /** Шаг 2: проверка сигнатуры и размера, удаление EXIF (геопозиция!), перенос в постоянный ключ, событие. */
  async completeUpload(request: platform.CompleteUploadRequest): Promise<platform.CompleteUploadResponse> {
    const owner = ownerOf(request.context);
    const asset = (await this.db.query<AssetRow>('SELECT * FROM assets WHERE id = $1', [request.uploadId])).rows[0];
    if (!asset || asset.owner_id !== owner) throw notFound('Загрузка не найдена');
    if (asset.status === 'ready') return { assetId: asset.id, status: asset.status };
    const original = await this.store.get(asset.object_key);
    if (!original) throw conflict('Файл ещё не загружен', 'upload_missing');
    const type = sniff(original);
    if (!type || original.length > MAX_BYTES) {
      await this.reject(asset);
      throw invalid('Файл не является изображением JPEG, PNG или WebP', 'invalid_file');
    }
    const clean = stripMetadata(original, type);
    const sha256 = createHash('sha256').update(clean).digest('hex');
    const finalKey = `${asset.purpose === 'verification' ? 'private/' : ''}${asset.purpose}/${owner}/${asset.id}.${EXT[type]}`;
    await this.store.put(finalKey, clean, type);
    await this.store.delete(asset.object_key);
    await this.db.transaction(async (tx) => {
      await tx.query("UPDATE assets SET status = 'ready', object_key = $2, content_type = $3, size = $4, sha256 = $5, completed_at = now() WHERE id = $1", [asset.id, finalKey, type, clean.length, sha256]);
      await enqueue(tx, 'media', [{ type: 'media.asset.uploaded.v1', key: asset.id, payload: { assetId: asset.id, ownerId: owner, purpose: asset.purpose, sha256, phash: '', contentType: type, size: clean.length } }]);
    });
    return { assetId: asset.id, status: 'ready' };
  }

  /** Удаление аккаунта: файлы пользователя удаляются из хранилища и из каталога медиа. */
  async eraseOwner(tx: Queryable, ownerId: string): Promise<void> {
    const { rows } = await tx.query<{ object_key: string }>('SELECT object_key FROM assets WHERE owner_id = $1', [ownerId]);
    for (const row of rows) await this.store.delete(row.object_key);
    await tx.query('DELETE FROM assets WHERE owner_id = $1', [ownerId]);
  }

  private async reject(asset: AssetRow): Promise<void> {
    await this.store.delete(asset.object_key);
    await this.db.query("UPDATE assets SET status = 'rejected', completed_at = now() WHERE id = $1", [asset.id]);
  }
}
