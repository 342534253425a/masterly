# Прод: рассчитано на ~⅓ нагрузки Avito (см. docs/architecture/capacity-planning.md).
# Автоскейлеры позволяют стартовать с меньшим запасом и расти по факту.
environment = "production"

node_groups = {
  system    = { cores = 4, memory = 16, min = 1, max = 2, disk_size = 64, taints = ["dedicated=system:NoSchedule"], labels = { workload = "system" } }
  apps      = { cores = 16, memory = 64, min = 4, max = 30, disk_size = 96, taints = [], labels = { workload = "apps" } }
  consumers = { cores = 8, memory = 32, min = 2, max = 16, disk_size = 64, taints = ["dedicated=consumers:NoSchedule"], labels = { workload = "consumers" } }
}

postgres_clusters = {
  # Каталог: чтение доминирует — 1 мастер + 2 реплики, read-реплики для гидратации карточек
  catalog = { preset = "s3-c16-m64", disk_size = 512, hosts = 3, databases = ["catalog"], max_conns = 800 }
  # Заявки и переписка — основной поток записи, секционирование по времени / хешу
  leads     = { preset = "s3-c16-m64", disk_size = 1024, hosts = 3, databases = ["leads"], max_conns = 800 }
  messaging = { preset = "s3-c16-m64", disk_size = 2048, hosts = 3, databases = ["messaging"], max_conns = 800 }
  # Лёгкие домены — общий кластер, разные БД и пользователи
  core = { preset = "s3-c8-m32", disk_size = 512, hosts = 3, databases = ["identity", "reviews", "notifications", "media", "trust"], max_conns = 600 }
}

kafka = { version = "3.9", brokers_per_az = 2, preset = "s3-c8-m32", disk_size = 1024 }

# Retry/DLQ для потребляемых топиков создаются автоматически (kafka.tf); здесь — переопределения.
kafka_topics = {
  "identity.account.v1"        = { partitions = 12, compact = false, retention_ms = 2592000000 }
  "catalog.master.v1"          = { partitions = 24, compact = true, retention_ms = 0 }
  "catalog.master.v1.retry"    = { partitions = 6, compact = false, retention_ms = 259200000 }
  "catalog.master.v1.dlq"      = { partitions = 3, compact = false, retention_ms = 1209600000 }
  "reviews.rating.v1"          = { partitions = 12, compact = true, retention_ms = 0 }
  "reviews.rating.v1.retry"    = { partitions = 3, compact = false, retention_ms = 259200000 }
  "leads.lead.v1"              = { partitions = 48, compact = false, retention_ms = 604800000 }
  "leads.lead.v1.retry"        = { partitions = 12, compact = false, retention_ms = 259200000 }
  "leads.lead.v1.dlq"          = { partitions = 3, compact = false, retention_ms = 1209600000 }
  "reviews.review.v1"          = { partitions = 12, compact = false, retention_ms = 604800000 }
  "reviews.review.v1.retry"    = { partitions = 3, compact = false, retention_ms = 259200000 }
  "messaging.message.v1"       = { partitions = 48, compact = false, retention_ms = 259200000 }
  "messaging.message.v1.retry" = { partitions = 12, compact = false, retention_ms = 259200000 }
  "media.asset.v1"             = { partitions = 12, compact = false, retention_ms = 604800000 }
  "media.asset.v1.retry"       = { partitions = 3, compact = false, retention_ms = 259200000 }
  "trust.moderation.v1"        = { partitions = 12, compact = false, retention_ms = 604800000 }
  "trust.moderation.v1.retry"  = { partitions = 3, compact = false, retention_ms = 259200000 }
  "analytics.events.v1"        = { partitions = 96, compact = false, retention_ms = 259200000 }
  "analytics.events.v1.retry"  = { partitions = 12, compact = false, retention_ms = 259200000 }
  "analytics.search.v1"        = { partitions = 48, compact = false, retention_ms = 259200000 }
  "analytics.search.v1.retry"  = { partitions = 12, compact = false, retention_ms = 259200000 }
}

redis      = { preset = "hm3-c4-m16", shards = 6, disk_size = 64 }
opensearch = { data_preset = "s3-c16-m64", data_hosts = 9, disk_size = 512 }
clickhouse = { preset = "s3-c16-m64", shards = 3, replicas = 2, disk_size = 2048 }
