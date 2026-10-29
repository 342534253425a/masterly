import { normalizeText } from './normalize.js';

/** Триграммы в стиле pg_trgm: слова дополняются пробелами слева и справа. */
export function trigrams(value: string): Set<string> {
  const set = new Set<string>();
  for (const word of normalizeText(value).split(' ')) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
  }
  return set;
}

/** Аналог similarity() из pg_trgm: |A ∩ B| / |A ∪ B|. */
export function trigramSimilarity(a: string, b: string): number {
  const left = trigrams(a);
  const right = trigrams(b);
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const gram of left) if (right.has(gram)) intersection++;
  return intersection / (left.size + right.size - intersection);
}

export function jaccard<T>(a: Iterable<T>, b: Iterable<T>): number {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection++;
  return intersection / (left.size + right.size - intersection);
}
