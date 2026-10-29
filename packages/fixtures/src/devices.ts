import { slugify } from '@masterly/kernel';

export interface BrandFixture {
  id: string;
  slug: string;
  name: string;
  aliases: readonly string[];
  popular: boolean;
}

export type DeviceTier = 1 | 2 | 3 | 4 | 5;

export interface ModelFixture {
  id: string;
  slug: string;
  brandId: string;
  name: string;
  fullName: string;
  year: number;
  /** Ценовой сегмент: 1 — бюджетный … 5 — флагман. Определяет стоимость запчастей. */
  tier: DeviceTier;
  /** Отличительные токены без бренда — словарь для классификатора проблем. */
  tokens: readonly string[];
}

export const BRANDS: readonly BrandFixture[] = [
  { id: 'apple', slug: 'apple', name: 'Apple', aliases: ['apple', 'iphone', 'айфон', 'эпл', 'эппл'], popular: true },
  { id: 'samsung', slug: 'samsung', name: 'Samsung', aliases: ['samsung', 'самсунг', 'galaxy', 'галакси'], popular: true },
  { id: 'xiaomi', slug: 'xiaomi', name: 'Xiaomi', aliases: ['xiaomi', 'сяоми', 'ксиоми', 'redmi', 'редми', 'poco', 'поко'], popular: true },
  { id: 'honor', slug: 'honor', name: 'Honor', aliases: ['honor', 'хонор'], popular: true },
  { id: 'huawei', slug: 'huawei', name: 'Huawei', aliases: ['huawei', 'хуавей', 'хуавэй'], popular: false },
  { id: 'google', slug: 'google', name: 'Google', aliases: ['google', 'pixel', 'гугл', 'пиксель'], popular: false },
  { id: 'realme', slug: 'realme', name: 'realme', aliases: ['realme', 'реалми'], popular: true },
  { id: 'tecno', slug: 'tecno', name: 'TECNO', aliases: ['tecno', 'техно'], popular: true },
  { id: 'infinix', slug: 'infinix', name: 'Infinix', aliases: ['infinix', 'инфиникс'], popular: false },
  { id: 'oneplus', slug: 'oneplus', name: 'OnePlus', aliases: ['oneplus', 'ванплас'], popular: false },
];

const RAW_MODELS: ReadonlyArray<readonly [brand: string, name: string, year: number, tier: DeviceTier]> = [
  ['apple', 'iPhone 17 Pro Max', 2025, 5], ['apple', 'iPhone 17 Pro', 2025, 5], ['apple', 'iPhone Air', 2025, 5],
  ['apple', 'iPhone 17', 2025, 5], ['apple', 'iPhone 16e', 2025, 4], ['apple', 'iPhone 16 Pro Max', 2024, 5],
  ['apple', 'iPhone 16 Pro', 2024, 5], ['apple', 'iPhone 16 Plus', 2024, 5], ['apple', 'iPhone 16', 2024, 5],
  ['apple', 'iPhone 15 Pro Max', 2023, 5], ['apple', 'iPhone 15 Pro', 2023, 5], ['apple', 'iPhone 15 Plus', 2023, 4],
  ['apple', 'iPhone 15', 2023, 4], ['apple', 'iPhone 14 Pro Max', 2022, 5], ['apple', 'iPhone 14 Pro', 2022, 5],
  ['apple', 'iPhone 14 Plus', 2022, 4], ['apple', 'iPhone 14', 2022, 4], ['apple', 'iPhone 13 Pro Max', 2021, 5],
  ['apple', 'iPhone 13 Pro', 2021, 4], ['apple', 'iPhone 13', 2021, 4], ['apple', 'iPhone 13 mini', 2021, 3],
  ['apple', 'iPhone 12 Pro', 2020, 4], ['apple', 'iPhone 12', 2020, 3], ['apple', 'iPhone 11 Pro', 2019, 3],
  ['apple', 'iPhone 11', 2019, 3], ['apple', 'iPhone SE 2022', 2022, 2],
  ['samsung', 'Galaxy S25 Ultra', 2025, 5], ['samsung', 'Galaxy S25', 2025, 5], ['samsung', 'Galaxy S24 Ultra', 2024, 5],
  ['samsung', 'Galaxy S24 FE', 2024, 3], ['samsung', 'Galaxy S24', 2024, 4], ['samsung', 'Galaxy S23 Ultra', 2023, 5],
  ['samsung', 'Galaxy S23 FE', 2023, 3], ['samsung', 'Galaxy S23', 2023, 4], ['samsung', 'Galaxy S22', 2022, 4],
  ['samsung', 'Galaxy Z Fold6', 2024, 5], ['samsung', 'Galaxy Z Flip6', 2024, 5], ['samsung', 'Galaxy A56', 2025, 3],
  ['samsung', 'Galaxy A55', 2024, 3], ['samsung', 'Galaxy A54', 2023, 3], ['samsung', 'Galaxy A35', 2024, 2],
  ['samsung', 'Galaxy A34', 2023, 2], ['samsung', 'Galaxy A25', 2023, 2], ['samsung', 'Galaxy A15', 2023, 1],
  ['xiaomi', 'Xiaomi 15', 2025, 4], ['xiaomi', 'Xiaomi 14T Pro', 2024, 4], ['xiaomi', 'Xiaomi 14', 2024, 4],
  ['xiaomi', 'Xiaomi 13', 2023, 4], ['xiaomi', 'Redmi Note 14 Pro', 2025, 2], ['xiaomi', 'Redmi Note 14', 2025, 2],
  ['xiaomi', 'Redmi Note 13 Pro', 2024, 2], ['xiaomi', 'Redmi Note 13', 2024, 2], ['xiaomi', 'Redmi Note 12', 2023, 1],
  ['xiaomi', 'Redmi 13C', 2023, 1], ['xiaomi', 'POCO X7 Pro', 2025, 3], ['xiaomi', 'POCO X6 Pro', 2024, 2],
  ['xiaomi', 'POCO F6', 2024, 3],
  ['honor', 'Honor 400', 2025, 3], ['honor', 'Honor Magic6 Pro', 2024, 5], ['honor', 'Honor 200', 2024, 3],
  ['honor', 'Honor 90', 2023, 3], ['honor', 'Honor X9b', 2023, 2],
  ['huawei', 'Huawei Pura 70', 2024, 4], ['huawei', 'Huawei Mate 60 Pro', 2023, 5], ['huawei', 'Huawei P60 Pro', 2023, 4],
  ['huawei', 'Huawei nova 12', 2024, 3],
  ['google', 'Pixel 9 Pro', 2024, 5], ['google', 'Pixel 9', 2024, 4], ['google', 'Pixel 8 Pro', 2023, 4],
  ['google', 'Pixel 8', 2023, 4], ['google', 'Pixel 7 Pro', 2022, 4], ['google', 'Pixel 7', 2022, 3],
  ['realme', 'realme GT 6', 2024, 3], ['realme', 'realme 12 Pro', 2024, 2], ['realme', 'realme C67', 2024, 1],
  ['tecno', 'TECNO Camon 30', 2024, 2], ['tecno', 'TECNO Spark 20 Pro', 2024, 1], ['tecno', 'TECNO Pova 6 Pro', 2024, 1],
  ['infinix', 'Infinix Note 40', 2024, 1], ['infinix', 'Infinix Hot 40', 2024, 1],
  ['oneplus', 'OnePlus 13', 2025, 4], ['oneplus', 'OnePlus 12', 2024, 4], ['oneplus', 'OnePlus Nord 4', 2024, 3],
];

const GENERIC = new Set(['iphone', 'galaxy', 'xiaomi', 'pixel', 'honor', 'huawei', 'realme', 'tecno', 'infinix', 'oneplus']);

function modelTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/\s+/)
    .flatMap((token) => {
      const wordNum = token.match(/^([a-z]{2,})(\d+)$/);
      return wordNum ? [wordNum[1]!, wordNum[2]!] : [token];
    })
    .filter((token) => !GENERIC.has(token));
}

const brandName = new Map(BRANDS.map((brand) => [brand.id, brand.name]));

export const MODELS: readonly ModelFixture[] = RAW_MODELS.map(([brandId, name, year, tier]) => {
  const slug = slugify(name);
  const prefix = brandName.get(brandId)!;
  return {
    id: slug,
    slug,
    brandId,
    name,
    fullName: name.toLowerCase().startsWith(prefix.toLowerCase()) ? name : `${prefix} ${name}`,
    year,
    tier,
    tokens: modelTokens(name),
  };
});

export const brandById = new Map(BRANDS.map((brand) => [brand.id, brand]));
export const modelById = new Map(MODELS.map((model) => [model.id, model]));
