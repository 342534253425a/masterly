import { stemRu, tokenize } from './normalize.js';

const MASK_64 = (1n << 64n) - 1n;
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

function fnv1a64(value: string): bigint {
  let hash = FNV_OFFSET;
  for (const char of value) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash;
}

function shingles(tokens: string[], size = 2): string[] {
  if (tokens.length <= size) return [tokens.join(' ')];
  const result: string[] = [];
  for (let i = 0; i <= tokens.length - size; i++) result.push(tokens.slice(i, i + size).join(' '));
  return result;
}

/**
 * 64-битный SimHash (Charikar) по биграммам стемов.
 * Похожие тексты дают хэши с малым расстоянием Хэмминга — так ищем накрученные отзывы
 * и скопированные описания профилей без попарного сравнения всех текстов.
 */
export function simhash64(text: string): bigint {
  const tokens = tokenize(text).map(stemRu);
  if (tokens.length === 0) return 0n;
  const weights = new Array<number>(64).fill(0);
  for (const shingle of shingles(tokens)) {
    const hash = fnv1a64(shingle);
    for (let bit = 0; bit < 64; bit++) {
      weights[bit] = (weights[bit] ?? 0) + (((hash >> BigInt(bit)) & 1n) === 1n ? 1 : -1);
    }
  }
  let fingerprint = 0n;
  for (let bit = 0; bit < 64; bit++) if ((weights[bit] ?? 0) > 0) fingerprint |= 1n << BigInt(bit);
  return fingerprint;
}

export function hammingDistance(a: bigint, b: bigint): number {
  let x = (a ^ b) & MASK_64;
  let count = 0;
  while (x !== 0n) {
    x &= x - 1n;
    count++;
  }
  return count;
}

/**
 * LSH-бэнды: 4 × 16 бит. Если хэши отличаются не более чем на 3 бита,
 * хотя бы один бэнд совпадёт (принцип Дирихле) — в БД это 4 обычных B-tree индекса.
 */
export function simhashBands(fingerprint: bigint, bands = 4): number[] {
  const width = 64 / bands;
  const mask = (1n << BigInt(width)) - 1n;
  return Array.from({ length: bands }, (_, i) => Number((fingerprint >> BigInt(i * width)) & mask));
}

/** Postgres BIGINT знаковый — приводим для хранения. */
export const toSignedInt64 = (fingerprint: bigint): bigint => BigInt.asIntN(64, fingerprint);
