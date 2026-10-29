const NON_WORD = /[^\p{L}\p{N}\s+#]/gu;

/** Нижний регистр, ё→е, без пунктуации, схлопнутые пробелы. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(NON_WORD, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  return normalized ? normalized.split(' ') : [];
}

const RU_ENDINGS = [
  'иями', 'ями', 'ами', 'ией', 'иям', 'ием', 'иях', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими',
  'ться', 'тся', 'ает', 'яет', 'ует', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ую', 'юю', 'ой', 'ей',
  'ий', 'ый', 'ом', 'ем', 'ам', 'ям', 'ах', 'ях', 'ов', 'ев', 'ию', 'ия', 'ии', 'ют', 'ут', 'ет',
  'ит', 'ат', 'ят', 'ть', 'ся', 'сь', 'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь', 'й',
].sort((a, b) => b.length - a.length);

/**
 * Лёгкий стеммер для русского языка (упрощённый Snowball): срезает самое длинное
 * подходящее окончание, оставляя основу не короче трёх букв.
 */
export function stemRu(word: string): string {
  if (word.length <= 3 || !/[а-я]/.test(word)) return word;
  for (const ending of RU_ENDINGS) {
    if (word.endsWith(ending) && word.length - ending.length >= 3) return word.slice(0, -ending.length);
  }
  return word;
}
