# Managed Kafka (KRaft): брокеры в трёх зонах, RF=3, min.insync.replicas=2 — запись переживает отказ зоны.
# У каждого сервиса свой пользователь с ACL только на нужные топики (producer / consumer).

resource "yandex_mdb_kafka_cluster" "main" {
  name                = "${local.name}-kafka"
  environment         = local.is_prod ? "PRODUCTION" : "PRESTABLE"
  network_id          = yandex_vpc_network.main.id
  subnet_ids          = yandex_vpc_subnet.private[*].id
  security_group_ids  = [yandex_vpc_security_group.data.id]
  deletion_protection = local.is_prod
  labels              = local.labels

  config {
    version          = var.kafka.version
    brokers_count    = var.kafka.brokers_per_az
    zones            = var.zones
    assign_public_ip = false
    schema_registry  = true

    kafka {
      resources {
        resource_preset_id = var.kafka.preset
        disk_type_id       = "network-ssd"
        disk_size          = var.kafka.disk_size
      }
      kafka_config {
        compression_type            = "COMPRESSION_TYPE_ZSTD"
        log_retention_hours         = 168
        num_partitions              = 12
        default_replication_factor  = 3
        auto_create_topics_enable   = false
        message_max_bytes           = 1048588
        replica_fetch_max_bytes     = 1048576
        socket_send_buffer_bytes    = 1048576
        socket_receive_buffer_bytes = 1048576
      }
    }

    kraft {
      resources {
        resource_preset_id = "s3-c2-m8"
        disk_type_id       = "network-ssd"
        disk_size          = 32
      }
    }
  }
}

# Для каждого потребляемого топика автоматически создаются <topic>.retry и <topic>.dlq
# (общие для consumer-групп, адресация заголовком x-consumer-group — см. docs/architecture/events.md).
# Явные записи в tfvars имеют приоритет (например, больше партиций retry в проде).
locals {
  consumed_topics = toset([for t in flatten([for acl in values(local.kafka_acl) : acl.consume]) : t if contains(keys(var.kafka_topics), t)])

  derived_topics = merge(
    { for t in local.consumed_topics : "${t}.retry" => { partitions = max(1, floor(var.kafka_topics[t].partitions / 4)), compact = false, retention_ms = 259200000 } },
    { for t in local.consumed_topics : "${t}.dlq" => { partitions = max(1, min(3, floor(var.kafka_topics[t].partitions / 4))), compact = false, retention_ms = 1209600000 } },
  )

  kafka_topics = merge(local.derived_topics, var.kafka_topics)
}

resource "yandex_mdb_kafka_topic" "topics" {
  for_each           = local.kafka_topics
  cluster_id         = yandex_mdb_kafka_cluster.main.id
  name               = each.key
  partitions         = each.value.partitions
  replication_factor = 3

  topic_config {
    cleanup_policy      = each.value.compact ? "CLEANUP_POLICY_COMPACT" : "CLEANUP_POLICY_DELETE"
    retention_ms        = each.value.compact ? null : each.value.retention_ms
    min_insync_replicas = 2
    compression_type    = "COMPRESSION_TYPE_ZSTD"
  }
}

locals {
  # Кто пишет и кто читает какие топики (принцип наименьших привилегий).
  # identity.account.v1 (удаление аккаунта, согласия) читают все сервисы, хранящие ПДн.
  kafka_acl = {
    identity      = { produce = ["identity.account.v1"], consume = [] }
    catalog       = { produce = ["catalog.master.v1"], consume = ["trust.moderation.v1", "identity.account.v1"] }
    search        = { produce = ["analytics.search.v1"], consume = ["catalog.master.v1", "reviews.rating.v1"] }
    leads         = { produce = ["leads.lead.v1"], consume = ["identity.account.v1"] }
    reviews       = { produce = ["reviews.review.v1", "reviews.rating.v1"], consume = ["leads.lead.v1", "trust.moderation.v1", "identity.account.v1"] }
    messaging     = { produce = ["messaging.message.v1"], consume = ["leads.lead.v1", "identity.account.v1"] }
    notifications = { produce = [], consume = ["leads.lead.v1", "messaging.message.v1", "reviews.review.v1", "trust.moderation.v1", "identity.account.v1"] }
    media         = { produce = ["media.asset.v1"], consume = ["identity.account.v1"] }
    analytics     = { produce = [], consume = ["analytics.events.v1", "analytics.search.v1", "leads.lead.v1", "identity.account.v1"] }
    trust         = { produce = ["trust.moderation.v1"], consume = ["catalog.master.v1", "reviews.review.v1", "media.asset.v1", "identity.account.v1"] }
    gateway       = { produce = ["analytics.events.v1"], consume = [] }
  }
}

resource "random_password" "kafka" {
  for_each = local.kafka_acl
  length   = 32
  special  = false
}

resource "yandex_mdb_kafka_user" "service" {
  for_each   = local.kafka_acl
  cluster_id = yandex_mdb_kafka_cluster.main.id
  name       = each.key
  password   = random_password.kafka[each.key].result

  # Права выдаются только на топики, существующие в окружении.
  # Потребитель пишет в <topic>.retry и <topic>.dlq (отложенные повторы и «карантин»).
  dynamic "permission" {
    for_each = toset([for t in concat(each.value.produce, flatten([for c in each.value.consume : ["${c}.retry", "${c}.dlq"]])) : t if contains(keys(local.kafka_topics), t)])
    content {
      topic_name = permission.value
      role       = "ACCESS_ROLE_PRODUCER"
    }
  }

  dynamic "permission" {
    for_each = toset([for t in flatten([for c in each.value.consume : [c, "${c}.retry"]]) : t if contains(keys(local.kafka_topics), t)])
    content {
      topic_name = permission.value
      role       = "ACCESS_ROLE_CONSUMER"
    }
  }

  depends_on = [yandex_mdb_kafka_topic.topics]
}
