environment = "staging"

node_groups = {
  apps = { cores = 8, memory = 32, min = 1, max = 4, disk_size = 64, taints = [], labels = { workload = "apps" } }
}

postgres_clusters = {
  core = { preset = "s3-c2-m8", disk_size = 64, hosts = 1, databases = ["identity", "catalog", "leads", "reviews", "messaging", "notifications", "media", "trust"], max_conns = 400 }
}

kafka = { version = "3.9", brokers_per_az = 1, preset = "s3-c2-m8", disk_size = 64 }

# Та же топология, что в проде (retry/DLQ добавляются автоматически), но меньше партиций
kafka_topics = {
  "identity.account.v1"  = { partitions = 3, compact = false, retention_ms = 2592000000 }
  "catalog.master.v1"    = { partitions = 6, compact = true, retention_ms = 0 }
  "reviews.rating.v1"    = { partitions = 3, compact = true, retention_ms = 0 }
  "leads.lead.v1"        = { partitions = 6, compact = false, retention_ms = 604800000 }
  "reviews.review.v1"    = { partitions = 3, compact = false, retention_ms = 604800000 }
  "messaging.message.v1" = { partitions = 6, compact = false, retention_ms = 259200000 }
  "media.asset.v1"       = { partitions = 3, compact = false, retention_ms = 604800000 }
  "trust.moderation.v1"  = { partitions = 3, compact = false, retention_ms = 604800000 }
  "analytics.events.v1"  = { partitions = 6, compact = false, retention_ms = 259200000 }
  "analytics.search.v1"  = { partitions = 6, compact = false, retention_ms = 259200000 }
}

redis      = { preset = "hm3-c2-m8", shards = 1, disk_size = 16 }
opensearch = { data_preset = "s3-c2-m8", data_hosts = 1, disk_size = 40 }
clickhouse = { preset = "s3-c2-m8", shards = 1, replicas = 1, disk_size = 64 }
