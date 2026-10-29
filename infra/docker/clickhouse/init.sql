-- Продуктовая аналитика: события → ClickHouse. Сырые события хранятся 180 дней (TTL),
-- агрегаты для кабинета мастера и админки считаются материализованными представлениями.

CREATE TABLE IF NOT EXISTS analytics.events
(
    event_date   Date DEFAULT toDate(ts),
    ts           DateTime64(3, 'Europe/Moscow'),
    name         LowCardinality(String),
    user_hash    String,
    master_id    String,
    search_id    String,
    city_id      LowCardinality(String),
    service_id   LowCardinality(String),
    source       LowCardinality(String),
    props        Map(String, String)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (name, master_id, ts)
TTL event_date + INTERVAL 180 DAY
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS analytics.searches
(
    ts            DateTime64(3, 'Europe/Moscow'),
    search_id     String,
    query         String,
    city_id       LowCardinality(String),
    service_id    LowCardinality(String),
    model_id      LowCardinality(String),
    results_count UInt32,
    took_ms       UInt32,
    user_hash     String,
    shown_ids     Array(String),
    promoted_ids  Array(String),
    INDEX query_tokens query TYPE tokenbf_v1(8192, 3, 0) GRANULARITY 4
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (city_id, service_id, ts)
-- В проде: партиции старше 30 дней переезжают на диск в Object Storage (TTL ... TO VOLUME 'cold'),
-- сырые поиски живут 90 дней, агрегаты (master_daily, search_gaps_daily) — бессрочно.
TTL toDate(ts) + INTERVAL 90 DAY;

-- Дневные агрегаты по мастеру: показы / просмотры / контакты / заявки (кабинет мастера, отчёты)
CREATE TABLE IF NOT EXISTS analytics.master_daily
(
    day         Date,
    master_id   String,
    impressions UInt64,
    promoted    UInt64,
    views       UInt64,
    contacts    UInt64,
    leads       UInt64
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(day)
ORDER BY (master_id, day);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.master_daily_mv TO analytics.master_daily AS
SELECT
    toDate(ts) AS day,
    master_id,
    toUInt64(0)                         AS impressions,
    toUInt64(0)                         AS promoted,
    countIf(name = 'profile_view')      AS views,
    countIf(name = 'contact_reveal')    AS contacts,
    countIf(name = 'lead_created')      AS leads
FROM analytics.events
WHERE master_id != ''
GROUP BY day, master_id;

-- Показы в поиске считаются из выдачи (searches.shown_ids), а не из отдельных событий на каждую карточку:
-- 9 000 поисков/с × 12 карточек дали бы ~100 000 строк/с без дополнительной информации.
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.master_impressions_mv TO analytics.master_daily AS
SELECT
    toDate(ts)                AS day,
    master_id,
    count()                   AS impressions,
    countIf(is_promoted)      AS promoted,
    toUInt64(0)               AS views,
    toUInt64(0)               AS contacts,
    toUInt64(0)               AS leads
FROM analytics.searches
ARRAY JOIN shown_ids AS master_id, arrayMap(id -> has(promoted_ids, id), shown_ids) AS is_promoted
GROUP BY day, master_id;

-- Запросы без результатов — сигнал для расширения каталога (админка → «Пробелы каталога»)
CREATE TABLE IF NOT EXISTS analytics.search_gaps_daily
(
    day     Date,
    city_id LowCardinality(String),
    query   String,
    hits    UInt64
)
ENGINE = SummingMergeTree
ORDER BY (day, city_id, query);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.search_gaps_mv TO analytics.search_gaps_daily AS
SELECT toDate(ts) AS day, city_id, lower(query) AS query, count() AS hits
FROM analytics.searches
WHERE results_count = 0 AND query != ''
GROUP BY day, city_id, query;
