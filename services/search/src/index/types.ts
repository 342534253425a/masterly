/** Документ read-модели поиска (совпадает с маппингом infra/docker/opensearch/masters-template.json). */
export interface MasterDoc {
  master_id: string;
  slug: string;
  city_id: string;
  district_id: string;
  name: string;
  tagline: string;
  location: { lat: number; lon: number };
  rating: number;
  bayesian_rating: number;
  reviews_count: number;
  /** catalog — исходный рейтинг профиля; reviews — пересчитан по отзывам и снимками catalog не перетирается. */
  rating_source: 'catalog' | 'reviews';
  response_time_min: number;
  warranty_days: number;
  verified: boolean;
  express: boolean;
  plan: string;
  promoted: boolean;
  promotion_erid: string;
  brand_ids: string[];
  visit_types: string[];
  parts: string[];
  service_ids: string[];
  offers: Array<{ service_id: string; price_from: number; tier_prices: number[]; warranty_days: number; duration_min: number }>;
  open_hours: Array<{ weekday: number; open_min: number; close_min: number }>;
  completeness: number;
  status: string;
  version: number;
  updated_at: string;
  accepting_leads: boolean;
  service_radius_km: number;
}

export type SortMode = 'relevance' | 'price' | 'rating' | 'distance' | 'response';

/** Запрос к индексу после понимания текста: только структурированные условия. */
export interface IndexQuery {
  cityId: string;
  serviceId?: string;
  brandId?: string;
  /** Сегмент устройства 1…5 — цена берётся из tier_prices. */
  tier?: number;
  text?: string;
  origin: { lat: number; lng: number };
  radiusKm?: number;
  priceMaxMinor?: number;
  ratingMin?: number;
  warrantyMinDays?: number;
  openAt?: { weekday: number; minutes: number };
  verifiedOnly: boolean;
  expressOnly: boolean;
  visitType?: string;
  parts?: string;
  acceptingLeadsOnly?: boolean;
  urgent: boolean;
  sort: SortMode;
  offset: number;
  limit: number;
}

export interface IndexHit {
  doc: MasterDoc;
  score: number;
  distanceKm: number;
  price?: { fromMinor: number; toMinor?: number };
}

export interface IndexResult {
  total: number;
  hits: IndexHit[];
  /** Кандидаты в рекламные слоты (маркированные карточки), отдельно от органики. */
  promoted: IndexHit[];
  services: Array<{ key: string; count: number }>;
  districts: Array<{ key: string; count: number }>;
}

export interface SearchIndex {
  upsert(doc: MasterDoc): Promise<void>;
  updateRating(masterId: string, rating: number, reviewsCount: number): Promise<void>;
  remove(masterId: string): Promise<void>;
  search(query: IndexQuery): Promise<IndexResult>;
  /** Точки для карты (без пагинации, с лимитом). */
  geo(query: IndexQuery, limit: number): Promise<IndexHit[]>;
  suggestMasters(prefix: string, cityId: string, limit: number): Promise<MasterDoc[]>;
}
