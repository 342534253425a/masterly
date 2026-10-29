# Данные

> Как устроено хранение: кто владеет какими данными, какие таблицы и индексы обслуживают горячие запросы,
> как растём, кэшируем, мигрируем и восстанавливаемся. Объёмы и нагрузка — в [capacity-planning.md](capacity-planning.md).

## 1. Принципы

- **БД на сервис** ([ADR-0005](../adr/0005-postgresql-database-per-service.md)). У сервиса своя база и свой
  пользователь с доступом только к ней. Межсервисных JOIN нет, нужные чужие данные приходят событиями и хранятся
  локально как read-модель (например, `reviews.review_eligibility` из `leads.lead.v1`).
- **Идентификаторы — UUIDv7.** Они упорядочены по времени, поэтому вставки идут в «хвост» B-дерева и не
  фрагментируют индекс. Время создания читается из самого id: по нему секционируем и пагинируем.
- **Деньги — целые копейки** (`bigint`, суффикс `_minor`). Время — `timestamptz` в UTC, часовой пояс применяется
  при отображении.
- **ПДн отделены от остальных данных.** Телефон и email хранятся зашифрованными (`*_enc`, AES-256-GCM, ключ
  из Lockbox; конвертная схема с KMS — этап 2). Для поиска и дедупликации используется детерминированный `HMAC-SHA256` (`*_hash`).
  Утечка дампа не раскрывает контакты ([security-privacy.md](security-privacy.md)).
- **Пагинация только keyset** (`WHERE id < $cursor ORDER BY id DESC LIMIT n`), без `OFFSET`.
- **Транзакции короткие.** `statement_timeout = 5s`, `lock_timeout = 3s`,
  `idle_in_transaction_session_timeout = 30s` заданы на уровне пользователей и кластера
  ([`postgres.tf`](../../infra/terraform/postgres.tf)).

## 2. Кластеры и пулинг

| Кластер | БД | Особенности |
|---|---|---|
| `catalog` | catalog | PostGIS, pg_trgm, btree_gin; чтение с реплик |
| `leads` | leads | Секции по месяцам, основной поток записи |
| `messaging` | messaging | Секции по месяцам, самый большой объём |
| `core` | identity, reviews, notifications, media, trust | Лёгкие домены, отдельные БД и пользователи |

Подключения идут через Odyssey в **transaction mode**. Отсюда правила:

- нельзя использовать сессионное состояние: `SET`, `LISTEN/NOTIFY`, временные таблицы, сессионные advisory-локи;
- prepared statements только неименованные (так работает node-postgres по умолчанию);
- блокировки берутся только как `pg_advisory_xact_lock` и живут до конца транзакции;
- чтения, допускающие задержку реплики (карточки, справочники), идут на реплики. Чтение после записи
  («мои заявки» сразу после создания) идёт на мастер.

## 3. Схемы и индексы

Правило: **у каждого запроса из кода есть индекс**, и он проверяется `EXPLAIN` в тесте миграции.
Горячие подмножества покрываются частичными индексами, ленты — покрывающими (`INCLUDE`). Медленные запросы
(> 250 мс) логируются (`log_min_duration_statement`), их разбирают через `pg_stat_statements`.

### catalog

```sql
CREATE TABLE masters (
  id               uuid PRIMARY KEY,                 -- UUIDv7
  slug             text NOT NULL UNIQUE,
  kind             text NOT NULL,                    -- individual | workshop | network
  display_name     text NOT NULL,
  tagline          text,
  description      text,
  city_id          text NOT NULL,
  status           text NOT NULL,                    -- draft | pending | published | suspended | deleted
  verification     smallint NOT NULL DEFAULT 0,      -- 0 нет · 1 телефон · 2 документы · 3 выезд/проверка
  plan             text NOT NULL DEFAULT 'basic',    -- basic | pro
  contact_policy   text NOT NULL DEFAULT 'reveal',   -- reveal | after_lead | chat_only
  phone_enc        bytea,
  phone_hash       bytea,                            -- HMAC: поиск дублей без расшифровки
  completeness     smallint NOT NULL DEFAULT 0,
  version          bigint NOT NULL DEFAULT 1,        -- растёт при каждом изменении, уходит в событие
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX masters_city_published ON masters (city_id) WHERE status = 'published';
CREATE INDEX masters_phone_hash ON masters (phone_hash) WHERE phone_hash IS NOT NULL;
CREATE INDEX masters_name_trgm ON masters USING gin (display_name gin_trgm_ops);  -- поиск в админке

-- Координаты профиля: lat/lng + geohash (btree, text_pattern_ops). Гео-запросы выдачи — в OpenSearch;
-- в БД нужны точка и соседство (поиск дубликатов). PostGIS включён в кластере для будущих зон выезда-полигонов.
CREATE INDEX masters_geohash ON masters (geohash text_pattern_ops);

-- Матрица цен: услуга мастера + цены по сегментам устройств 1…5 (копейки)
CREATE TABLE offers (
  master_id          uuid NOT NULL,
  service_id         text NOT NULL,
  price_from_minor   bigint NOT NULL,
  price_to_minor     bigint NOT NULL,
  tier_prices_minor  integer[] NOT NULL DEFAULT '{}',
  duration_min       integer NOT NULL,
  warranty_days      integer NOT NULL,
  parts              text[] NOT NULL DEFAULT '{}',
  enabled            boolean NOT NULL DEFAULT true,
  PRIMARY KEY (master_id, service_id)
) PARTITION BY HASH (master_id);                     -- 16 секций: ~150 млн строк в масштабе
```

Остальные таблицы: `staff` (сотрудники и роли в кабинете), `supported_models (master_id, model_id)` с обратным
индексом по `model_id`, `portfolio_items (master_id, created_at DESC)` и `promotions` (период, слот, erid).
Для промо есть частичный индекс по активным: `WHERE ends_at > now()` использовать нельзя (функция не immutable),
поэтому активные помечаются флагом `active` и снимаются планировщиком.

### leads

Заявки и получатели секционированы **по диапазону UUIDv7**. Первичный ключ остаётся одним столбцом `id`, а граница
секции — это UUIDv7 первой миллисекунды месяца. Запросы за последние 90 дней отсекают старые секции
(partition pruning).

```sql
CREATE TABLE leads (
  id                uuid NOT NULL,
  client_id         uuid NOT NULL,
  idempotency_key   text NOT NULL,
  city_id           text NOT NULL,
  service_id        text NOT NULL,
  model_id          text,
  description       text NOT NULL,                   -- телефоны и email маскируются при сохранении
  urgency           text NOT NULL,
  visit_type        text NOT NULL,
  share_phone       boolean NOT NULL DEFAULT false,
  status            text NOT NULL,                   -- open | in_progress | completed | cancelled | expired
  version           integer NOT NULL DEFAULT 1,
  expires_at        timestamptz NOT NULL,
  PRIMARY KEY (id)
) PARTITION BY RANGE (id);
CREATE UNIQUE INDEX leads_idempotency ON leads (client_id, idempotency_key, id);
CREATE INDEX leads_client ON leads (client_id, id DESC);                 -- «Мои заявки»
CREATE INDEX leads_expiring ON leads (expires_at) WHERE status = 'open';  -- фоновое истечение

CREATE TABLE lead_recipients (
  lead_id       uuid NOT NULL,
  master_id     uuid NOT NULL,
  status        text NOT NULL,                       -- sent | viewed | responded | declined | chosen | expired
  delivered_at  timestamptz,
  responded_at  timestamptz,
  PRIMARY KEY (lead_id, master_id)
) PARTITION BY RANGE (lead_id);                      -- те же границы, что у leads
-- Входящие мастера: лента без сортировки в памяти, статус берётся из индекса
CREATE INDEX recipients_inbox ON lead_recipients (master_id, lead_id DESC) INCLUDE (status);
```

В секционированной таблице уникальный индекс обязан содержать ключ секционирования, поэтому в `leads_idempotency`
добавлен `id`. Глобальную уникальность пары `(client_id, idempotency_key)` обеспечивает upsert в небольшой
несекционированной таблице `lead_idempotency` с TTL 7 суток в той же транзакции.

Ещё таблицы: `lead_responses` с `UNIQUE (lead_id, master_id)`; `contact_reveals` — журнал раскрытий с индексами
`(user_id, revealed_at)` против парсинга и `(master_id, revealed_at)` для статистики мастера; `outbox`, `inbox`.

### reviews

| Таблица | Ключи и индексы | Зачем |
|---|---|---|
| `review_eligibility` | PK `lead_id` | Право на отзыв из события «заявка завершена»: отзыв без реального обращения невозможен |
| `reviews` | `UNIQUE (lead_id)`; `(master_id, id DESC) WHERE status = 'published'` | Один отзыв на заявку; лента опубликованных |
| `review_replies` | PK `review_id` | Ответ мастера |
| `ratings` | PK `master_id` | Счётчики и распределение 1…5, байесовская оценка → `reviews.rating.v1` |

Байесовский рейтинг: `(C·m + Σ оценок) / (C + n)`, где `m` — средняя по категории, `C = 10`. Мастер с одной
пятёркой не обгоняет мастера с сотней оценок 4,8.

### messaging

- `conversations`: `UNIQUE (lead_id, master_id)`, индексы `(client_id, last_message_at DESC)` и
  `(master_id, last_message_at DESC)`.
- `messages`: секции по диапазону UUIDv7 (месяц), индекс `(conversation_id, id DESC)`. История листается
  keyset-курсором по `id`.
- `read_markers (conversation_id, user_id) → last_read_id`. Число непрочитанных хранится в Redis и пересчитывается
  из маркера при промахе.

### identity, notifications, media, trust

| Сервис | Ключевые таблицы | Индексы и детали |
|---|---|---|
| identity | `users`, `sessions`, `consents`, `signing_keys`, `data_exports` | `UNIQUE (phone_hash)`, `UNIQUE (email_hash)`. В `sessions` хранится `refresh_hash` и `family_id` для обнаружения повторного использования. `consents` — журнал только на добавление (доказательство согласия). Приватные ключи JWT обёрнуты KMS. |
| notifications | `preferences`, `devices`, `deliveries` | `deliveries.dedupe_key UNIQUE` защищает от повторной отправки при повторе события. Отложенные отправки (тихие часы, повторы) — строки с `scheduled_for`, которые поды разбирают через `FOR UPDATE SKIP LOCKED`: без отдельного брокера задач, переживают рестарты. |
| media | `assets` | `(owner_id, id DESC)`; `sha256` для точных дублей; `phash` — 4 полосы по 16 бит с индексом на каждую (LSH для похожих фото). Документы верификации лежат в отдельном бакете со строгим доступом. |
| trust | `fingerprints`, `cases`, `decisions`, `complaints` | `fingerprints`: полосы SimHash/pHash с индексами — кандидаты в дубликаты находятся через совпадение любой полосы, без попарного сравнения. Очередь модерации: `(status, score DESC) WHERE status = 'open'`. `decisions` — журнал только на добавление. |

### search — OpenSearch

- Индекс `masters-vN` и алиас `masters`. Шаблон — [`masters-template.json`](../../infra/docker/opensearch/masters-template.json).
- **Анализаторы.** При индексации: `ru_text` (морфология и ICU-нормализация). При поиске: `ru_search` с синонимами
  (`synonym_graph`, «айфон» → «iphone», «тачскрин» → «сенсор»). Синонимы обновляются без переиндексации.
  Для префиксных подсказок — `autocomplete`.
- **Документ.** Денормализованный профиль: гео (`geo_point`), рейтинг, скорость ответа, гарантия, верификация,
  бренды и модели. Цены вложены (`nested`) с сегментами устройств, часы работы тоже `nested` — для фильтра
  «открыто сейчас».
- **Ранжирование.** `function_score`: соответствие услуге и модели, гео-затухание `gauss` (масштаб зависит от
  срочности), байесовский рейтинг, скорость ответа, полнота профиля, верификация. Реклама в счёт не входит,
  она стоит в отдельных слотах.
- **Порядок обновлений.** Upsert с `version_type: external` и версией из события. Старое событие после нового
  игнорируется самим OpenSearch.

### analytics — ClickHouse

Схема — [`clickhouse/init.sql`](../../infra/docker/clickhouse/init.sql).

- `events` — продуктовые события, `ORDER BY (name, master_id, ts)`.
- `searches` — одна строка на выдачу, включая показанные (`shown_ids`) и рекламные (`promoted_ids`) карточки.
- Материализованные представления считают `master_daily` (показы, просмотры, контакты, заявки — отчёт мастера) и
  `search_gaps_daily` (запросы без результатов — расширение каталога по реальному спросу).
- Идентификатор пользователя только псевдонимный (`user_hash`), сырых ПДн нет.

## 4. Секционирование и шардирование

1. **Секции по времени** (leads, lead_recipients, messages, deliveries, outbox). Inbox не секционируется: записи старше 14 дней удаляются батчами по индексу `processed_at`. Задача планировщика
   (лидер выбирается через `pg_try_advisory_xact_lock`) заранее создаёт секции на 3 месяца вперёд. Старые секции
   отсоединяются (`DETACH … CONCURRENTLY`), выгружаются в Parquet в Object Storage и удаляются, когда истекает
   срок хранения.
2. **Хэш-секции** для матрицы цен: `offers` × 16 по `master_id`. Индексы меньше, VACUUM быстрее.
3. **Шардирование приложением** — следующий шаг, когда одна запись упрётся в мастер: > 5 000 TPS или > 2 ТБ
   ([capacity-planning.md §8](capacity-planning.md#8-когда-и-что-масштабировать-дальше)). Ключи шардирования:
   `client_id` для заявок, `conversation_id` для сообщений. Карта шардов — в конфигурации сервиса.
   UUIDv7 не требует глобального генератора.

## 5. Кэширование

| Уровень | Что | Инвалидация |
|---|---|---|
| CDN | Статика, изображения, SEO-страницы (ISR) | Версионированные имена; `revalidateTag` по событию |
| Next.js | Данные RSC и справочники | Теги (`cacheTag`), TTL |
| Шлюз | Публичные GET с подсказкой `cache` в контракте маршрута | `stale-while-revalidate`, короткий TTL |
| Сервисы — Redis | Карточки (protobuf), выдача, подсказки, тайлы карты | TTL + событийная: потребитель `catalog.master.v1` перезаписывает карточку, если версия новее (Lua compare-and-set) |
| OpenSearch | Request и query cache | Встроенная, при refresh |

- **Против «лавины» на промахах.** Внутри процесса работает single-flight: один запрос к источнику на ключ.
  Популярные ключи заранее обновляются вероятностно (XFetch). Отсутствующие сущности кэшируются на 30 с.
- **Кэш не обязателен.** Ошибка Redis — это промах, а не отказ. Обращения к источнику при этом ограничены
  bulkhead-лимитом, чтобы БД не получила всю нагрузку разом ([resilience.md](resilience.md)).

## 6. Миграции

- SQL-файлы лежат рядом с сервисом (`services/<name>/migrations`). Их применяет `dist/migrate.js` в Helm-хуке
  `pre-upgrade` (Job) до выкатки подов.
- **Без сессионных локов** (transaction pooling). Каждая миграция идёт в своей транзакции:
  `pg_advisory_xact_lock(hash(файла))`, затем проверка `schema_migrations`, затем применение и запись.
  Два параллельных запуска безопасны: второй дождётся локa и увидит, что миграция уже применена.
- `CREATE INDEX CONCURRENTLY` нельзя выполнять в транзакции. Такие файлы помечаются `-- migrate:no-transaction` и
  пишутся идемпотентно (`IF NOT EXISTS`). Невалидный индекс после сбоя (`pg_index.indisvalid = false`)
  удаляется и строится заново.
- **Expand → migrate → contract.** Схема всегда совместима с текущей и предыдущей версией кода (rolling update).
  Удалять или переименовывать столбец можно только в следующем релизе, когда старый код уже нигде не работает.
  Заполнение больших таблиц — фоновой задачей батчами по 5 000 строк с паузами, не в миграции.

## 7. Бэкапы и восстановление

| Хранилище | Механизм | RPO | RTO |
|---|---|---|---|
| PostgreSQL | Managed PITR (WAL + ежедневный полный бэкап), хранение 14 дней в проде; синхронная реплика в другой зоне | ≈ 0 при отказе хоста; ≤ 5 мин при восстановлении на момент времени | Секунды–минуты (failover); ≤ 1 ч (PITR в новый кластер) |
| Kafka | RF = 3; компактированные топики восстанавливаются из БД командой «переопубликовать всё» | ≈ 0 | Минуты |
| OpenSearch | Ежедневные snapshot в Object Storage; read-модель пересобирается из `catalog.master.v1` | Секунды (догоняет по лагу) | ~1 ч на полную пересборку |
| ClickHouse | Реплики + бэкапы в Object Storage; последние 3 дня можно переиграть из Kafka | ≤ 3 дней сырых данных — без потерь | Часы (аналитика не на критическом пути) |
| Redis | Персистентность включена, но это кэш и очереди: потеря допустима | — | Минуты |
| Object Storage | Версионирование (старые версии хранятся 30 дней), репликация внутри облака | ≈ 0 | — |

Учения: ежемесячно PITR-восстановление случайного кластера в staging с проверкой целостности. Раз в квартал —
полная пересборка поискового индекса на проде через blue/green.

## 8. Сроки хранения

Ориентиры. Окончательные сроки утверждает юрист и фиксирует в политике обработки ПДн.

| Данные | Срок | Механизм |
|---|---|---|
| OTP-коды | 5 мин | TTL в Redis |
| Refresh-сессии | 60 дней с последнего использования | Фоновая очистка |
| Заявки, ответы, раскрытия контактов | Срок гарантии + исковая давность (ориентир — 3 года) | Отсоединение секций → архив → удаление |
| Сообщения и вложения | Пока жив аккаунт + обязательные сроки | Удаление и обезличивание по `AccountDeletionRequested` |
| Фото заявок и чатов | 1 год после закрытия заявки | Lifecycle-правила бакета |
| Сырые продуктовые события | 180 дней | TTL ClickHouse |
| Сырые поиски | 90 дней (агрегаты бессрочно) | TTL ClickHouse |
| Журнал согласий | Пока жив аккаунт + 3 года | Только на добавление |
| Логи приложений | 14 дней, без ПДн | Retention Loki |
| Трейсы | 7 дней | Retention Tempo |
| Аудит действий администраторов | 1 год | Журнал только на добавление |

Удаление аккаунта: публичные ПДн исчезают сразу, всё остальное обезличивается и удаляется после истечения
`retain_until` из события `AccountDeletionRequested` ([events.md](events.md),
[security-privacy.md](security-privacy.md#8-права-субъекта-пдн)).
