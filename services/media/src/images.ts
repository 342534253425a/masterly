/** Тип по сигнатуре файла (magic bytes), а не по расширению или заявленному Content-Type. */
export function sniff(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  return undefined;
}

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));

/**
 * Удаляет метаданные (EXIF с геопозицией, XMP, комментарии), не трогая пиксели:
 * JPEG — сегменты APP1…APP15 и COM; PNG — чанки eXIf/tEXt/iTXt/zTXt; WebP — чанки EXIF/XMP.
 */
export function stripMetadata(bytes: Uint8Array, type: 'image/jpeg' | 'image/png' | 'image/webp'): Uint8Array {
  if (type === 'image/jpeg') return stripJpeg(bytes);
  if (type === 'image/png') return stripPng(bytes);
  return stripWebp(bytes);
}

function stripJpeg(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1]!;
    if (marker === 0xda) break; // начало данных изображения: дальше копируем как есть
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    const segment = bytes.subarray(offset, offset + 2 + length);
    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata) parts.push(segment);
    offset += 2 + length;
  }
  parts.push(bytes.subarray(offset));
  return concat(parts);
}

function stripPng(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    const chunk = bytes.subarray(offset, offset + 12 + length);
    if (!['eXIf', 'tEXt', 'iTXt', 'zTXt'].includes(type)) parts.push(chunk);
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return concat(parts);
}

function stripWebp(bytes: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const total = 8 + size + (size % 2);
    if (type !== 'EXIF' && type !== 'XMP ') chunks.push(bytes.subarray(offset, offset + total));
    offset += total;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 4), 0);
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  header.set(bytes.subarray(8, 12), 8);
  return concat([header, body]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
