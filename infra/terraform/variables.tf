variable "cloud_id" {
  type        = string
  description = "ID облака Yandex Cloud"
}

variable "folder_id" {
  type        = string
  description = "ID каталога окружения (staging / production)"
}

variable "environment" {
  type        = string
  description = "Имя окружения"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment: staging или production."
  }
}

variable "zones" {
  type        = list(string)
  description = "Зоны доступности (три зоны — переживаем отказ целой зоны)"
  default     = ["ru-central1-a", "ru-central1-b", "ru-central1-d"]
}

variable "vpc_cidrs" {
  type        = list(string)
  description = "Подсети по зонам"
  default     = ["10.10.0.0/18", "10.10.64.0/18", "10.10.128.0/18"]
}

variable "k8s_version" {
  type    = string
  default = "1.32"
}

variable "node_groups" {
  description = "Группы узлов Kubernetes: системные, приложения, консьюмеры Kafka"
  type = map(object({
    cores     = number
    memory    = number
    min       = number
    max       = number
    disk_size = number
    taints    = list(string)
    labels    = map(string)
  }))
}

variable "postgres_clusters" {
  description = "Кластеры PostgreSQL: тяжёлые домены — отдельно, лёгкие — вместе (database-per-service внутри)"
  type = map(object({
    preset     = string
    disk_size  = number
    hosts      = number
    databases  = list(string)
    max_conns  = number
  }))
}

variable "kafka" {
  type = object({
    version        = string
    brokers_per_az = number
    preset         = string
    disk_size      = number
  })
}

variable "kafka_topics" {
  description = "Топики: партиции, компактирование, retention (мс)"
  type = map(object({
    partitions   = number
    compact      = bool
    retention_ms = number
  }))
}

variable "redis" {
  type = object({
    preset    = string
    shards    = number
    disk_size = number
  })
}

variable "opensearch" {
  type = object({
    data_preset  = string
    data_hosts   = number
    disk_size    = number
  })
}

variable "clickhouse" {
  type = object({
    preset    = string
    shards    = number
    replicas  = number
    disk_size = number
  })
}

variable "domain" {
  type    = string
  default = "masterly.ru"
}
