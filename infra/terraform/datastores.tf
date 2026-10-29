# Кэш, поиск и аналитика — managed-сервисы в трёх зонах.

resource "random_password" "redis" {
  length  = 32
  special = false
}

# Valkey/Redis Cluster: шардирование по слотам, реплика в другой зоне, TLS.
# Кэш карточек и выдачи, rate limiting (GCRA), идемпотентность, OTP, BullMQ, Socket.IO adapter.
resource "yandex_mdb_redis_cluster" "main" {
  name                = "${local.name}-redis"
  environment         = local.is_prod ? "PRODUCTION" : "PRESTABLE"
  network_id          = yandex_vpc_network.main.id
  security_group_ids  = [yandex_vpc_security_group.data.id]
  sharded             = var.redis.shards > 1
  tls_enabled         = true
  persistence_mode    = "ON"
  deletion_protection = local.is_prod
  labels              = local.labels

  config {
    password         = random_password.redis.result
    version          = "7.2"
    maxmemory_policy = "ALLKEYS_LFU"
    timeout          = 300
  }

  resources {
    resource_preset_id = var.redis.preset
    disk_type_id       = "network-ssd"
    disk_size          = var.redis.disk_size
  }

  dynamic "host" {
    for_each = { for pair in setproduct(range(var.redis.shards), range(2)) : "${pair[0]}-${pair[1]}" => pair }
    content {
      shard_name = "shard${host.value[0] + 1}"
      zone       = var.zones[(host.value[0] + host.value[1]) % length(var.zones)]
      subnet_id  = yandex_vpc_subnet.private[(host.value[0] + host.value[1]) % length(var.zones)].id
    }
  }
}

resource "random_password" "opensearch" {
  length  = 32
  special = false
}

# OpenSearch: русская морфология и синонимы, geo_point, function_score; реплики шардов в других зонах.
resource "yandex_mdb_opensearch_cluster" "main" {
  name                = "${local.name}-search"
  environment         = local.is_prod ? "PRODUCTION" : "PRESTABLE"
  network_id          = yandex_vpc_network.main.id
  security_group_ids  = [yandex_vpc_security_group.data.id]
  deletion_protection = local.is_prod
  labels              = local.labels

  config {
    admin_password = random_password.opensearch.result

    opensearch {
      node_groups {
        name             = "managers"
        hosts_count      = 3
        zone_ids         = var.zones
        subnet_ids       = yandex_vpc_subnet.private[*].id
        assign_public_ip = false
        roles            = ["MANAGER"]
        resources {
          resource_preset_id = "s3-c2-m8"
          disk_type_id       = "network-ssd"
          disk_size          = 20
        }
      }

      node_groups {
        name             = "data"
        hosts_count      = var.opensearch.data_hosts
        zone_ids         = var.zones
        subnet_ids       = yandex_vpc_subnet.private[*].id
        assign_public_ip = false
        roles            = ["DATA"]
        resources {
          resource_preset_id = var.opensearch.data_preset
          disk_type_id       = "network-ssd"
          disk_size          = var.opensearch.disk_size
        }
      }

      plugins = ["analysis-icu", "analysis-morphology"]
    }
  }
}

resource "random_password" "clickhouse" {
  length  = 32
  special = false
}

# ClickHouse: шарды × реплики (ReplicatedMergeTree), встроенный ClickHouse Keeper.
resource "yandex_mdb_clickhouse_cluster" "main" {
  name                = "${local.name}-analytics"
  environment         = local.is_prod ? "PRODUCTION" : "PRESTABLE"
  network_id          = yandex_vpc_network.main.id
  security_group_ids  = [yandex_vpc_security_group.data.id]
  deletion_protection = local.is_prod
  embedded_keeper     = true
  labels              = local.labels

  clickhouse {
    resources {
      resource_preset_id = var.clickhouse.preset
      disk_type_id       = "network-ssd"
      disk_size          = var.clickhouse.disk_size
    }
  }

  database {
    name = "analytics"
  }

  user {
    name     = "analytics"
    password = random_password.clickhouse.result
    permission {
      database_name = "analytics"
    }
  }

  dynamic "host" {
    for_each = { for pair in setproduct(range(var.clickhouse.shards), range(var.clickhouse.replicas)) : "${pair[0]}-${pair[1]}" => pair }
    content {
      type       = "CLICKHOUSE"
      shard_name = "shard${host.value[0] + 1}"
      zone       = var.zones[host.value[1] % length(var.zones)]
      subnet_id  = yandex_vpc_subnet.private[host.value[1] % length(var.zones)].id
    }
  }
}
