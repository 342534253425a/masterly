import { normalizeText, stemRu } from '../text/normalize.js';

export interface ClassifierService {
  id: string;
  /** Префиксы основ: «разби» покрывает «разбил», «разбился», «разбитый». */
  keywords: readonly string[];
  /** Фразы с весом: «не заряжается» → разъём зарядки. */
  phrases: ReadonlyArray<readonly [phrase: string, weight: number]>;
}

export interface ClassifierBrand {
  id: string;
  aliases: readonly string[];
}

export interface ClassifierModel {
  id: string;
  brandId: string;
  /** Отличительные токены модели без названия бренда: iPhone 13 Pro → ["13", "pro"]. */
  tokens: readonly string[];
}

export interface ProblemInterpretation {
  services: Array<{ id: string; score: number }>;
  brandId: string | null;
  modelId: string | null;
  urgent: boolean;
  confidence: number;
  matchedTerms: string[];
}

/** Русские написания моделей и брендов → латинские токены. Ключи — уже стеммированные основы. */
const DEVICE_SYNONYMS: Record<string, string> = {
  айфон: 'iphone', эпл: 'apple', самсунг: 'samsung', галакс: 'galaxy', галакси: 'galaxy',
  сяом: 'xiaomi', ксиом: 'xiaomi', редм: 'redmi', поко: 'poco', хонор: 'honor', хуав: 'huawei',
  хуавей: 'huawei', хуавэй: 'huawei', пиксел: 'pixel', гугл: 'google', реалм: 'realme', техно: 'tecno',
  инфиникс: 'infinix', ванплас: 'oneplus', про: 'pro', макс: 'max', мин: 'mini', мини: 'mini',
  плюс: 'plus', ультр: 'ultra', ноут: 'note', нот: 'note', эйр: 'air', лайт: 'lite', фолд: 'fold',
  флип: 'flip', нео: 'neo',
};

const URGENT = /(срочн|быстр|сегодня|сейчас|немедленн|за час)/;

function deviceTokens(text: string): string[] {
  const raw = normalizeText(text).split(' ').filter(Boolean);
  const mapped: string[] = [];
  for (const token of raw) {
    const stem = stemRu(token);
    const synonym = DEVICE_SYNONYMS[stem] ?? DEVICE_SYNONYMS[token];
    if (synonym) {
      mapped.push(synonym);
      continue;
    }
    // «13pro» → «13», «pro»; «iphone13» → «iphone», «13»; «s23», «a54», «x6» оставляем целыми
    const numWord = token.match(/^([a-z]?\d+)([a-z]{2,})$/);
    const wordNum = token.match(/^([a-z]{2,})(\d+)$/);
    if (numWord) mapped.push(numWord[1]!, numWord[2]!);
    else if (wordNum) mapped.push(wordNum[1]!, wordNum[2]!);
    else mapped.push(token);
  }
  // «s 23» → «s23»
  const joined: string[] = [];
  for (let i = 0; i < mapped.length; i++) {
    const current = mapped[i]!;
    const next = mapped[i + 1];
    if (/^[a-z]$/.test(current) && next && /^\d+$/.test(next)) {
      joined.push(current + next);
      i++;
    } else joined.push(current);
  }
  return joined;
}

export interface ProblemClassifier {
  classify(text: string): ProblemInterpretation;
}

export function createProblemClassifier(input: {
  services: readonly ClassifierService[];
  brands: readonly ClassifierBrand[];
  models: readonly ClassifierModel[];
}): ProblemClassifier {
  const brandAliases = new Map<string, string>();
  for (const brand of input.brands) {
    for (const alias of brand.aliases) for (const token of deviceTokens(alias)) brandAliases.set(token, brand.id);
  }
  const phrases = input.services.flatMap((service) =>
    service.phrases.map(([phrase, weight]) => ({ serviceId: service.id, phrase: normalizeText(phrase), weight })),
  );
  const keywords = input.services.flatMap((service) =>
    service.keywords.map((keyword) => ({ serviceId: service.id, prefix: normalizeText(keyword) })),
  );

  function detectDevice(text: string): { brandId: string | null; modelId: string | null } {
    const tokens = deviceTokens(text);
    const tokenSet = new Set(tokens);
    let brandId: string | null = null;
    for (const token of tokens) {
      const match = brandAliases.get(token);
      if (match) {
        brandId = match;
        break;
      }
    }
    let best: { model: ClassifierModel; score: number } | null = null;
    for (const model of input.models) {
      if (brandId && model.brandId !== brandId) continue;
      if (!model.tokens.every((t) => tokenSet.has(t))) continue;
      const distinctive = model.tokens.some((t) => !/^\d+$/.test(t)) || model.tokens.length > 1;
      if (!brandId && !distinctive) continue;
      const score = model.tokens.length + (brandId ? 1 : 0);
      if (!best || score > best.score) best = { model, score };
    }
    if (best) return { brandId: best.model.brandId, modelId: best.model.id };
    return { brandId, modelId: null };
  }

  return {
    classify(text) {
      const normalized = normalizeText(text);
      const scores = new Map<string, number>();
      const matchedTerms = new Set<string>();
      const add = (serviceId: string, weight: number) => scores.set(serviceId, (scores.get(serviceId) ?? 0) + weight);

      for (const { serviceId, phrase, weight } of phrases) {
        if (phrase && normalized.includes(phrase)) {
          add(serviceId, weight);
          matchedTerms.add(phrase);
        }
      }
      const tokens = normalized.split(' ').filter((t) => t.length >= 2);
      for (const { serviceId, prefix } of keywords) {
        const hit = tokens.find((token) => token.startsWith(prefix) || stemRu(token).startsWith(prefix));
        if (hit) {
          add(serviceId, 1);
          matchedTerms.add(hit);
        }
      }

      const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
      const top = ranked[0]?.[1] ?? 0;
      const services = ranked
        .filter(([, score]) => score >= top * 0.5)
        .slice(0, 3)
        .map(([id, score]) => ({ id, score: Number(score.toFixed(2)) }));
      const device = detectDevice(text);

      return {
        services,
        brandId: device.brandId,
        modelId: device.modelId,
        urgent: URGENT.test(normalized),
        confidence: Number((top / (top + 1)).toFixed(2)),
        matchedTerms: [...matchedTerms],
      };
    },
  };
}
