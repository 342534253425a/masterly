export interface DistrictFixture {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Станции метро или ориентиры (в Краснодаре метро нет). */
  landmarks: readonly string[];
}

export interface CityFixture {
  id: string;
  slug: string;
  name: string;
  /** Предложный падеж для SEO-заголовков: «в Москве». */
  nameIn: string;
  timezone: string;
  center: { lat: number; lng: number };
  zoom: number;
  population: number;
  hasMetro: boolean;
  districts: readonly DistrictFixture[];
  streets: readonly string[];
  phonePrefix: string;
}

export const CITIES: readonly CityFixture[] = [
  {
    id: 'msk',
    slug: 'moskva',
    name: 'Москва',
    nameIn: 'в Москве',
    timezone: 'Europe/Moscow',
    center: { lat: 55.7558, lng: 37.6173 },
    zoom: 10.4,
    population: 13_150_000,
    hasMetro: true,
    phonePrefix: '+7495',
    districts: [
      { id: 'msk-tverskoy', name: 'Тверской', lat: 55.7652, lng: 37.605, landmarks: ['Тверская', 'Пушкинская', 'Охотный Ряд'] },
      { id: 'msk-arbat', name: 'Арбат', lat: 55.7495, lng: 37.5915, landmarks: ['Арбатская', 'Смоленская'] },
      { id: 'msk-zamoskvorechye', name: 'Замоскворечье', lat: 55.7367, lng: 37.6305, landmarks: ['Новокузнецкая', 'Третьяковская', 'Павелецкая'] },
      { id: 'msk-basmanny', name: 'Басманный', lat: 55.765, lng: 37.66, landmarks: ['Курская', 'Бауманская', 'Красные Ворота'] },
      { id: 'msk-presnensky', name: 'Пресненский', lat: 55.76, lng: 37.56, landmarks: ['Улица 1905 года', 'Баррикадная', 'Выставочная'] },
      { id: 'msk-khamovniki', name: 'Хамовники', lat: 55.729, lng: 37.577, landmarks: ['Парк культуры', 'Фрунзенская', 'Спортивная'] },
      { id: 'msk-tagansky', name: 'Таганский', lat: 55.74, lng: 37.656, landmarks: ['Таганская', 'Марксистская', 'Пролетарская'] },
      { id: 'msk-meshchansky', name: 'Мещанский', lat: 55.781, lng: 37.631, landmarks: ['Проспект Мира', 'Сухаревская'] },
      { id: 'msk-sokol', name: 'Сокол', lat: 55.805, lng: 37.515, landmarks: ['Сокол', 'Аэропорт'] },
      { id: 'msk-maryino', name: 'Марьино', lat: 55.65, lng: 37.744, landmarks: ['Марьино', 'Братиславская'] },
      { id: 'msk-mitino', name: 'Митино', lat: 55.846, lng: 37.36, landmarks: ['Митино', 'Волоколамская'] },
      { id: 'msk-izmailovo', name: 'Измайлово', lat: 55.788, lng: 37.78, landmarks: ['Измайловская', 'Первомайская'] },
      { id: 'msk-akademichesky', name: 'Академический', lat: 55.687, lng: 37.575, landmarks: ['Академическая', 'Профсоюзная'] },
      { id: 'msk-khoroshevo', name: 'Хорошёво-Мнёвники', lat: 55.777, lng: 37.49, landmarks: ['Полежаевская', 'Народное Ополчение'] },
      { id: 'msk-yasenevo', name: 'Ясенево', lat: 55.606, lng: 37.533, landmarks: ['Ясенево', 'Новоясеневская'] },
    ],
    streets: [
      'Тверская ул.', 'ул. Арбат', 'Новый Арбат', 'Пятницкая ул.', 'ул. Покровка', 'Мясницкая ул.',
      'Ленинградский пр-т', 'Профсоюзная ул.', 'Кутузовский пр-т', 'ул. Маросейка', 'Большая Дмитровка',
      'Люблинская ул.', 'Митинская ул.', 'Первомайская ул.', 'Ленинский пр-т', 'Варшавское ш.',
    ],
  },
  {
    id: 'spb',
    slug: 'sankt-peterburg',
    name: 'Санкт-Петербург',
    nameIn: 'в Санкт-Петербурге',
    timezone: 'Europe/Moscow',
    center: { lat: 59.9343, lng: 30.3351 },
    zoom: 10.6,
    population: 5_600_000,
    hasMetro: true,
    phonePrefix: '+7812',
    districts: [
      { id: 'spb-central', name: 'Центральный', lat: 59.933, lng: 30.36, landmarks: ['Площадь Восстания', 'Маяковская', 'Чернышевская'] },
      { id: 'spb-admiralteysky', name: 'Адмиралтейский', lat: 59.923, lng: 30.307, landmarks: ['Садовая', 'Сенная площадь', 'Адмиралтейская'] },
      { id: 'spb-vasileostrovsky', name: 'Василеостровский', lat: 59.942, lng: 30.25, landmarks: ['Василеостровская', 'Приморская'] },
      { id: 'spb-petrogradsky', name: 'Петроградский', lat: 59.965, lng: 30.311, landmarks: ['Петроградская', 'Горьковская', 'Чкаловская'] },
      { id: 'spb-moskovsky', name: 'Московский', lat: 59.852, lng: 30.321, landmarks: ['Московская', 'Электросила', 'Парк Победы'] },
      { id: 'spb-primorsky', name: 'Приморский', lat: 60.0, lng: 30.26, landmarks: ['Старая Деревня', 'Комендантский проспект'] },
      { id: 'spb-vyborgsky', name: 'Выборгский', lat: 60.045, lng: 30.34, landmarks: ['Озерки', 'Удельная', 'Парнас'] },
      { id: 'spb-nevsky', name: 'Невский', lat: 59.89, lng: 30.465, landmarks: ['Ломоносовская', 'Елизаровская'] },
      { id: 'spb-kalininsky', name: 'Калининский', lat: 59.999, lng: 30.39, landmarks: ['Академическая', 'Политехническая'] },
      { id: 'spb-frunzensky', name: 'Фрунзенский', lat: 59.87, lng: 30.38, landmarks: ['Купчино', 'Международная'] },
    ],
    streets: [
      'Невский пр-т', 'Литейный пр-т', 'Садовая ул.', 'Большой пр-т В.О.', 'Каменноостровский пр-т',
      'Московский пр-т', 'Гороховая ул.', 'ул. Рубинштейна', 'Лиговский пр-т', 'пр-т Просвещения',
      'Дунайский пр-т', 'Коломяжский пр-т', 'Средний пр-т В.О.',
    ],
  },
  {
    id: 'krd',
    slug: 'krasnodar',
    name: 'Краснодар',
    nameIn: 'в Краснодаре',
    timezone: 'Europe/Moscow',
    center: { lat: 45.0355, lng: 38.9753 },
    zoom: 11.2,
    population: 1_150_000,
    hasMetro: false,
    phonePrefix: '+7861',
    districts: [
      { id: 'krd-central', name: 'Центральный', lat: 45.0355, lng: 38.9753, landmarks: ['ул. Красная', 'Театральная площадь'] },
      { id: 'krd-zapadny', name: 'Западный', lat: 45.042, lng: 38.93, landmarks: ['Кубанская набережная', 'Парк Победы'] },
      { id: 'krd-karasunsky', name: 'Карасунский', lat: 45.025, lng: 39.035, landmarks: ['Старокубанская', 'ТРЦ «Сити Центр»'] },
      { id: 'krd-prikubansky', name: 'Прикубанский', lat: 45.075, lng: 38.97, landmarks: ['ул. Российская', 'Музыкальный микрорайон'] },
      { id: 'krd-festivalny', name: 'Фестивальный', lat: 45.053, lng: 38.985, landmarks: ['ул. Тургенева', 'Стадион «Кубань»'] },
      { id: 'krd-yubileyny', name: 'Юбилейный', lat: 45.045, lng: 38.915, landmarks: ['пр-т Чекистов', 'ТРЦ «Галактика»'] },
      { id: 'krd-gidrostroy', name: 'Гидрострой', lat: 45.024, lng: 39.065, landmarks: ['ул. Игнатова', 'Гидростроителей'] },
    ],
    streets: [
      'ул. Красная', 'ул. Северная', 'ул. Ставропольская', 'ул. Тургенева', 'ул. Уральская',
      'ул. Кубанская Набережная', 'ул. Головатого', 'ул. Мира', 'ул. Дзержинского', 'пр-т Чекистов',
      'ул. 40-летия Победы', 'ул. Восточно-Кругликовская',
    ],
  },
];

export const cityById = new Map(CITIES.map((city) => [city.id, city]));
export const cityBySlug = new Map(CITIES.map((city) => [city.slug, city]));
