output "kubernetes_cluster_id" {
  value = yandex_kubernetes_cluster.main.id
}

output "registry" {
  value = "cr.yandex/${yandex_container_registry.main.id}"
}

output "postgres_hosts" {
  description = "Read-write FQDN (Odyssey) по кластерам; read-only: c-<id>.ro.mdb.yandexcloud.net"
  value       = { for k, c in yandex_mdb_postgresql_cluster.main : k => "c-${c.id}.rw.mdb.yandexcloud.net:6432" }
}

output "kafka_cluster_id" {
  value = yandex_mdb_kafka_cluster.main.id
}

output "media_bucket" {
  value = yandex_storage_bucket.media.bucket
}

output "lockbox_secrets" {
  value = { for k, s in yandex_lockbox_secret.service : k => s.id }
}
