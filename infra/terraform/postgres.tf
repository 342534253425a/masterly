# PostgreSQL 17 (Managed): по кластеру на группу доменов, 3 хоста в разных зонах (1 мастер + 2 реплики),
# встроенный пулер Odyssey в transaction mode, PITR-бэкапы, Performance Diagnostics.
# Каждый сервис — своя БД и свой пользователь (database-per-service), доступ только к своей БД.

locals {
  pg_service_dbs = merge([
    for cluster, cfg in var.postgres_clusters : { for db in cfg.databases : db => cluster }
  ]...)
}

resource "random_password" "pg" {
  for_each = local.pg_service_dbs
  length   = 32
  special  = false
}

resource "yandex_mdb_postgresql_cluster" "main" {
  for_each            = var.postgres_clusters
  name                = "${local.name}-pg-${each.key}"
  environment         = local.is_prod ? "PRODUCTION" : "PRESTABLE"
  network_id          = yandex_vpc_network.main.id
  security_group_ids  = [yandex_vpc_security_group.data.id]
  deletion_protection = local.is_prod
  labels              = local.labels

  config {
    version = 17
    resources {
      resource_preset_id = each.value.preset
      disk_type_id       = "network-ssd"
      disk_size          = each.value.disk_size
    }

    pooler_config {
      pooling_mode = "TRANSACTION"
      pool_discard = false
    }

    backup_retain_period_days = local.is_prod ? 14 : 3
    backup_window_start {
      hours   = 1
      minutes = 0
    }

    performance_diagnostics {
      enabled                      = true
      sessions_sampling_interval   = 60
      statements_sampling_interval = 600
    }

    postgresql_config = {
      max_connections                     = each.value.max_conns
      shared_preload_libraries            = "SHARED_PRELOAD_LIBRARIES_PG_STAT_STATEMENTS"
      log_min_duration_statement          = 250
      idle_in_transaction_session_timeout = 30000
      random_page_cost                    = 1.1
      effective_io_concurrency            = 200
      default_statistics_target           = 500
    }
  }

  dynamic "host" {
    for_each = range(each.value.hosts)
    content {
      zone      = var.zones[host.value % length(var.zones)]
      subnet_id = yandex_vpc_subnet.private[host.value % length(var.zones)].id
    }
  }

  maintenance_window {
    type = "WEEKLY"
    day  = "TUE"
    hour = 2
  }
}

resource "yandex_mdb_postgresql_user" "service" {
  for_each   = local.pg_service_dbs
  cluster_id = yandex_mdb_postgresql_cluster.main[each.value].id
  name       = each.key
  password   = random_password.pg[each.key].result
  conn_limit = 200
  settings = {
    default_transaction_isolation = "read committed"
    statement_timeout             = 5000
    lock_timeout                  = 3000
  }
}

resource "yandex_mdb_postgresql_database" "service" {
  for_each   = local.pg_service_dbs
  cluster_id = yandex_mdb_postgresql_cluster.main[each.value].id
  name       = each.key
  owner      = yandex_mdb_postgresql_user.service[each.key].name

  dynamic "extension" {
    for_each = contains(["catalog", "trust"], each.key) ? ["postgis", "pg_trgm", "btree_gin"] : ["pg_trgm"]
    content {
      name = extension.value
    }
  }
}
