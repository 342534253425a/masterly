/**
 * UUIDv7 (RFC 9562): первые 48 бит — unix-время в мс.
 * Монотонно растущие ключи не фрагментируют B-tree индексы (в отличие от UUIDv4)
 * и дают сортировку по времени создания бесплатно — удобно для keyset-пагинации.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const ts = BigInt(now);
  for (let i = 0; i < 6; i++) bytes[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuidv7Timestamp(id: string): number {
  return Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16);
}
