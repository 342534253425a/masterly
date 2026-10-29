# Object Storage: медиа (фото работ, заявок) с шифрованием KMS и CDN; бэкапы; реестр образов; секреты в Lockbox.

resource "yandex_kms_symmetric_key" "storage" {
  name              = "${local.name}-storage"
  default_algorithm = "AES_256"
  rotation_period   = "8760h"
}

resource "yandex_iam_service_account" "storage" {
  name = "${local.name}-storage"
}

resource "yandex_resourcemanager_folder_iam_member" "storage_editor" {
  folder_id = var.folder_id
  role      = "storage.editor"
  member    = "serviceAccount:${yandex_iam_service_account.storage.id}"
}

resource "yandex_kms_symmetric_key_iam_member" "storage_kms" {
  symmetric_key_id = yandex_kms_symmetric_key.storage.id
  role             = "kms.keys.encrypterDecrypter"
  member           = "serviceAccount:${yandex_iam_service_account.storage.id}"
}

resource "yandex_iam_service_account_static_access_key" "storage" {
  service_account_id = yandex_iam_service_account.storage.id
  description        = "S3-ключ для media-сервиса (presigned URL)"
}

resource "yandex_storage_bucket" "media" {
  bucket     = "${local.name}-media"
  access_key = yandex_iam_service_account_static_access_key.storage.access_key
  secret_key = yandex_iam_service_account_static_access_key.storage.secret_key

  anonymous_access_flags {
    read = false
    list = false
  }

  versioning {
    enabled = true
  }

  # Незавершённые загрузки и неподтверждённые фото удаляются автоматически
  lifecycle_rule {
    id                                     = "abort-multipart"
    enabled                                = true
    abort_incomplete_multipart_upload_days = 1
  }
  lifecycle_rule {
    id      = "tmp-uploads"
    enabled = true
    filter { prefix = "tmp/" }
    expiration { days = 2 }
  }
  lifecycle_rule {
    id      = "noncurrent-versions"
    enabled = true
    noncurrent_version_expiration { days = 30 }
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        kms_master_key_id = yandex_kms_symmetric_key.storage.id
        sse_algorithm     = "aws:kms"
      }
    }
  }

  cors_rule {
    allowed_methods = ["PUT", "GET"]
    allowed_origins = ["https://${var.domain}", "https://www.${var.domain}"]
    allowed_headers = ["*"]
    max_age_seconds = 3600
  }

  depends_on = [yandex_resourcemanager_folder_iam_member.storage_editor, yandex_kms_symmetric_key_iam_member.storage_kms]
}

resource "yandex_storage_bucket" "backups" {
  bucket     = "${local.name}-backups"
  access_key = yandex_iam_service_account_static_access_key.storage.access_key
  secret_key = yandex_iam_service_account_static_access_key.storage.secret_key

  default_storage_class = "COLD"

  object_lock_configuration {
    object_lock_enabled = "Enabled"
    rule {
      default_retention {
        mode = "GOVERNANCE"
        days = 30
      }
    }
  }

  versioning {
    enabled = true
  }
}

resource "yandex_container_registry" "main" {
  name   = local.name
  labels = local.labels
}

# Сканирование образов на уязвимости при загрузке в реестр
resource "yandex_container_registry_iam_binding" "pullers" {
  registry_id = yandex_container_registry.main.id
  role        = "container-registry.images.puller"
  members     = ["serviceAccount:${yandex_iam_service_account.k8s_nodes.id}"]
}

resource "yandex_kms_symmetric_key" "lockbox" {
  name              = "${local.name}-lockbox"
  default_algorithm = "AES_256"
  rotation_period   = "8760h"
}

# Секреты сервисов: строки подключения к БД, Kafka, Redis — в Lockbox; в кластер их доставляет External Secrets
resource "yandex_lockbox_secret" "service" {
  for_each   = local.kafka_acl
  name       = "${local.name}-${each.key}"
  kms_key_id = yandex_kms_symmetric_key.lockbox.id
  labels     = local.labels
}

resource "yandex_lockbox_secret_version" "service" {
  for_each  = local.kafka_acl
  secret_id = yandex_lockbox_secret.service[each.key].id

  entries {
    key        = "KAFKA_SASL_USERNAME"
    text_value = each.key
  }
  entries {
    key        = "KAFKA_SASL_PASSWORD"
    text_value = random_password.kafka[each.key].result
  }
  entries {
    key        = "REDIS_PASSWORD"
    text_value = random_password.redis.result
  }
  dynamic "entries" {
    for_each = contains(keys(local.pg_service_dbs), each.key) ? [each.key] : []
    content {
      key        = "DATABASE_URL"
      text_value = "postgres://${entries.value}:${random_password.pg[entries.value].result}@c-${yandex_mdb_postgresql_cluster.main[local.pg_service_dbs[entries.value]].id}.rw.mdb.yandexcloud.net:6432/${entries.value}?sslmode=verify-full"
    }
  }
}
