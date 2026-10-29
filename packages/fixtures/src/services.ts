export type CategoryStatus = 'active' | 'soon';

export interface CategoryFixture {
  id: string;
  slug: string;
  name: string;
  icon: string;
  status: CategoryStatus;
  /** Пользователи, оставившие заявку «сообщить о запуске» — сигнал спроса для расширения каталога. */
  waitlist: number;
}

/** Вертикали платформы. MVP — ремонт смартфонов; остальные включаются фичефлагом без изменения схемы. */
export const CATEGORIES: readonly CategoryFixture[] = [
  { id: 'smartphones', slug: 'remont-smartfonov', name: 'Ремонт смартфонов', icon: 'smartphone', status: 'active', waitlist: 0 },
  { id: 'laptops', slug: 'remont-noutbukov', name: 'Ноутбуки и ПК', icon: 'laptop', status: 'soon', waitlist: 4120 },
  { id: 'appliances', slug: 'bytovaya-tehnika', name: 'Бытовая техника', icon: 'washing-machine', status: 'soon', waitlist: 3380 },
  { id: 'plumbing', slug: 'santehnika', name: 'Сантехника', icon: 'wrench', status: 'soon', waitlist: 2910 },
  { id: 'electrical', slug: 'elektrika', name: 'Электрика', icon: 'plug', status: 'soon', waitlist: 2240 },
  { id: 'hvac', slug: 'kondicionery', name: 'Кондиционеры', icon: 'air-vent', status: 'soon', waitlist: 1570 },
  { id: 'cleaning', slug: 'klining', name: 'Клининг', icon: 'sparkles', status: 'soon', waitlist: 1890 },
  { id: 'auto', slug: 'avtoservis', name: 'Автосервис', icon: 'car', status: 'soon', waitlist: 3010 },
];

export interface ServiceFixture {
  id: string;
  slug: string;
  categoryId: string;
  name: string;
  short: string;
  description: string;
  icon: string;
  /** Базовая цена (руб.) для устройства среднего ценового сегмента (tier 3). */
  basePrice: number;
  /** Насколько цена зависит от сегмента устройства: 0 — фиксированная, 1 — сильно. */
  elasticity: number;
  durationMin: number;
  warrantyDays: number;
  /** Есть выбор запчасти: оригинал / OEM / копия. */
  partsChoice: boolean;
  brandIds?: readonly string[];
  /** Типовая формулировка проблемы клиентом — для подсказок и шаблонов. */
  problem: string;
  keywords: readonly string[];
  phrases: ReadonlyArray<readonly [string, number]>;
  demand: number;
}

export const SERVICES: readonly ServiceFixture[] = [
  {
    id: 'display', slug: 'zamena-displeya', categoryId: 'smartphones', name: 'Замена дисплея', short: 'Дисплей',
    description: 'Разбитый экран, полосы, пятна или не работает сенсор — меняем модуль целиком на оригинал или качественную копию.',
    icon: 'smartphone', basePrice: 6500, elasticity: 1, durationMin: 60, warrantyDays: 180, partsChoice: true,
    problem: 'разбил экран',
    keywords: ['экран', 'диспле', 'разби', 'трещ', 'тачскрин', 'сенсор', 'полос', 'матриц'],
    phrases: [['не работает сенсор', 1.5], ['черный экран', 1], ['не показывает', 1], ['пятна на экране', 1.5], ['зеленые полосы', 2]],
    demand: 1,
  },
  {
    id: 'glass', slug: 'zamena-stekla', categoryId: 'smartphones', name: 'Замена стекла', short: 'Стекло',
    description: 'Переклейка стекла, если изображение и сенсор в порядке. Дешевле полной замены модуля, сохраняет оригинальную матрицу.',
    icon: 'scan', basePrice: 4200, elasticity: 0.9, durationMin: 120, warrantyDays: 90, partsChoice: false,
    problem: 'треснуло стекло',
    keywords: ['стекл', 'переклей'],
    phrases: [['только стекло', 2], ['треснуло стекло', 1.5], ['изображение нормальное', 1]],
    demand: 0.45,
  },
  {
    id: 'battery', slug: 'zamena-akkumulyatora', categoryId: 'smartphones', name: 'Замена аккумулятора', short: 'Аккумулятор',
    description: 'Телефон быстро садится, выключается на холоде или аккумулятор вздулся. Ставим новые АКБ с калибровкой.',
    icon: 'battery-charging', basePrice: 2900, elasticity: 0.55, durationMin: 40, warrantyDays: 180, partsChoice: true,
    problem: 'быстро садится',
    keywords: ['батаре', 'аккум', 'акб', 'сади', 'разряж', 'вздул'],
    phrases: [['быстро садится', 2], ['не держит заряд', 2], ['выключается на холоде', 2], ['выключается при', 1.2]],
    demand: 0.85,
  },
  {
    id: 'port', slug: 'remont-razema-zaryadki', categoryId: 'smartphones', name: 'Ремонт разъёма зарядки', short: 'Разъём зарядки',
    description: 'Не заряжается, кабель болтается или зарядка идёт только под углом. Чистка или замена разъёма.',
    icon: 'plug-zap', basePrice: 2400, elasticity: 0.45, durationMin: 45, warrantyDays: 90, partsChoice: false,
    problem: 'не заряжается',
    keywords: ['разъем', 'гнезд', 'lightning', 'порт'],
    phrases: [['не заряжается', 2], ['зарядка под углом', 2], ['кабель болтается', 2], ['не видит зарядку', 2], ['медленно заряжается', 1]],
    demand: 0.7,
  },
  {
    id: 'camera', slug: 'remont-kamery', categoryId: 'smartphones', name: 'Ремонт камеры', short: 'Камера',
    description: 'Размытые фото, не фокусируется, трещина на стекле камеры или чёрный экран в приложении камеры.',
    icon: 'camera', basePrice: 4300, elasticity: 0.85, durationMin: 60, warrantyDays: 90, partsChoice: true,
    problem: 'не фокусируется камера',
    keywords: ['камер', 'фокус', 'объектив', 'размыт', 'мыльн'],
    phrases: [['стекло камеры', 2.5], ['не фокусируется', 2], ['не работает камера', 2], ['черный экран в камере', 2.5]],
    demand: 0.5,
  },
  {
    id: 'water', slug: 'remont-posle-vody', categoryId: 'smartphones', name: 'Ремонт после воды', short: 'После воды',
    description: 'Срочная ультразвуковая чистка платы после попадания влаги — чем раньше, тем выше шанс спасти телефон и данные.',
    icon: 'droplets', basePrice: 2800, elasticity: 0.4, durationMin: 120, warrantyDays: 30, partsChoice: false,
    problem: 'уронил в воду',
    keywords: ['вод', 'утоп', 'намок', 'влаг', 'жидк', 'залил', 'промок'],
    phrases: [['упал в воду', 2.5], ['уронил в воду', 2.5], ['залил водой', 2], ['побывал в воде', 2]],
    demand: 0.4,
  },
  {
    id: 'back', slug: 'zamena-zadney-kryshki', categoryId: 'smartphones', name: 'Замена задней крышки', short: 'Задняя крышка',
    description: 'Разбитая задняя панель или стекло корпуса — вернём телефону аккуратный вид без следов ремонта.',
    icon: 'layers', basePrice: 3300, elasticity: 0.9, durationMin: 90, warrantyDays: 90, partsChoice: true,
    problem: 'разбил заднюю крышку',
    keywords: ['крышк', 'корпус', 'задн', 'спинк'],
    phrases: [['задняя крышка', 2], ['разбил заднее стекло', 2.5], ['треснула крышка', 2]],
    demand: 0.35,
  },
  {
    id: 'speaker', slug: 'remont-dinamika', categoryId: 'smartphones', name: 'Динамик и микрофон', short: 'Звук',
    description: 'Не слышно собеседника, хрипит динамик или вас плохо слышно при звонке. Чистка сеток или замена модулей.',
    icon: 'volume-2', basePrice: 2300, elasticity: 0.5, durationMin: 45, warrantyDays: 90, partsChoice: false,
    problem: 'не слышно собеседника',
    keywords: ['динамик', 'микрофон', 'слыш', 'звук', 'хрип', 'шипит'],
    phrases: [['не слышно собеседника', 2.5], ['меня не слышно', 2.5], ['тихий звук', 1.5], ['хрипит динамик', 2]],
    demand: 0.35,
  },
  {
    id: 'buttons', slug: 'remont-knopok', categoryId: 'smartphones', name: 'Ремонт кнопок', short: 'Кнопки',
    description: 'Залипает или не нажимается кнопка питания, громкости или переключатель режима.',
    icon: 'power', basePrice: 2100, elasticity: 0.5, durationMin: 45, warrantyDays: 90, partsChoice: false,
    problem: 'не нажимается кнопка',
    keywords: ['кнопк', 'залип', 'нажима', 'клавиш'],
    phrases: [['кнопка питания', 2], ['кнопка громкости', 2], ['не нажимается', 1.5]],
    demand: 0.25,
  },
  {
    id: 'faceid', slug: 'vosstanovlenie-face-id', categoryId: 'smartphones', name: 'Восстановление Face ID', short: 'Face ID',
    description: 'Перестал работать Face ID или Touch ID после падения или попадания влаги. Восстанавливаем без замены платы.',
    icon: 'scan-face', basePrice: 7800, elasticity: 0.6, durationMin: 180, warrantyDays: 90, partsChoice: false,
    brandIds: ['apple'],
    problem: 'не работает Face ID',
    keywords: ['face', 'фейс', 'touch', 'отпечат'],
    phrases: [['face id', 2.5], ['touch id', 2.5], ['не работает отпечаток', 2], ['не распознает лицо', 2]],
    demand: 0.2,
  },
  {
    id: 'software', slug: 'proshivka', categoryId: 'smartphones', name: 'Прошивка и настройка', short: 'Прошивка',
    description: 'Зависает на логотипе, циклическая перезагрузка, ошибки обновления, вирусы и сброс до заводских настроек.',
    icon: 'cpu', basePrice: 1500, elasticity: 0.2, durationMin: 60, warrantyDays: 30, partsChoice: false,
    problem: 'висит на логотипе',
    keywords: ['прошив', 'обновл', 'логотип', 'перезагруж', 'глюч', 'тормоз', 'вирус', 'зависа'],
    phrases: [['висит на логотипе', 2.5], ['не обновляется', 2], ['постоянно перезагружается', 2.5], ['забыл пароль', 2]],
    demand: 0.45,
  },
  {
    id: 'diagnostics', slug: 'diagnostika', categoryId: 'smartphones', name: 'Диагностика', short: 'Диагностика',
    description: 'Бесплатно определим причину неисправности за 15–30 минут и назовём точную цену ремонта до начала работ.',
    icon: 'stethoscope', basePrice: 0, elasticity: 0, durationMin: 30, warrantyDays: 0, partsChoice: false,
    problem: 'не включается',
    keywords: ['диагност', 'провер', 'греет', 'нагрев'],
    phrases: [['не включается', 2], ['не знаю что', 2], ['сильно греется', 1.5], ['не реагирует', 1.5], ['упал', 0.6]],
    demand: 0.6,
  },
  {
    id: 'data', slug: 'vosstanovlenie-dannyh', categoryId: 'smartphones', name: 'Восстановление данных', short: 'Данные',
    description: 'Достанем фото, контакты и переписки с разбитого или неисправного телефона. Работаем конфиденциально.',
    icon: 'hard-drive-download', basePrice: 3800, elasticity: 0.5, durationMin: 240, warrantyDays: 0, partsChoice: false,
    problem: 'нужно достать фото',
    keywords: ['данн', 'перенос', 'восстанов'],
    phrases: [['восстановить фото', 2.5], ['достать данные', 2.5], ['перенести данные', 2], ['пропали контакты', 2]],
    demand: 0.2,
  },
  {
    id: 'network', slug: 'remont-svyazi', categoryId: 'smartphones', name: 'Связь и Wi-Fi', short: 'Связь',
    description: 'Нет сети, не видит SIM-карту, не включается Wi-Fi, Bluetooth или NFC.',
    icon: 'signal', basePrice: 3100, elasticity: 0.6, durationMin: 90, warrantyDays: 90, partsChoice: false,
    problem: 'не ловит сеть',
    keywords: ['сеть', 'сети', 'связ', 'симк', 'wifi', 'вайфай', 'блютуз', 'bluetooth', 'nfc', 'модем'],
    phrases: [['не ловит сеть', 2.5], ['нет сети', 2.5], ['не видит сим', 2.5], ['не работает wi fi', 2], ['не работает nfc', 2]],
    demand: 0.25,
  },
];

export const serviceById = new Map(SERVICES.map((service) => [service.id, service]));
export const serviceBySlug = new Map(SERVICES.map((service) => [service.slug, service]));
