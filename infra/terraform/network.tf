locals {
  name    = "masterly-${var.environment}"
  labels  = { project = "masterly", environment = var.environment, managed_by = "terraform" }
  is_prod = var.environment == "production"
}

resource "yandex_vpc_network" "main" {
  name   = local.name
  labels = local.labels
}

# Исходящий трафик из приватных подсетей — через NAT-шлюз (у узлов нет публичных IP)
resource "yandex_vpc_gateway" "nat" {
  name = "${local.name}-nat"
  shared_egress_gateway {}
}

resource "yandex_vpc_route_table" "private" {
  name       = "${local.name}-private"
  network_id = yandex_vpc_network.main.id

  static_route {
    destination_prefix = "0.0.0.0/0"
    gateway_id         = yandex_vpc_gateway.nat.id
  }
}

resource "yandex_vpc_subnet" "private" {
  count          = length(var.zones)
  name           = "${local.name}-${var.zones[count.index]}"
  zone           = var.zones[count.index]
  network_id     = yandex_vpc_network.main.id
  v4_cidr_blocks = [var.vpc_cidrs[count.index]]
  route_table_id = yandex_vpc_route_table.private.id
  labels         = local.labels
}

# Доступ к managed-базам — только из подсетей кластера Kubernetes
resource "yandex_vpc_security_group" "data" {
  name       = "${local.name}-data"
  network_id = yandex_vpc_network.main.id

  ingress {
    description    = "PostgreSQL / Odyssey"
    protocol       = "TCP"
    port           = 6432
    v4_cidr_blocks = var.vpc_cidrs
  }
  ingress {
    description    = "Kafka SASL_SSL"
    protocol       = "TCP"
    port           = 9091
    v4_cidr_blocks = var.vpc_cidrs
  }
  ingress {
    description    = "Valkey/Redis TLS"
    protocol       = "TCP"
    port           = 6380
    v4_cidr_blocks = var.vpc_cidrs
  }
  ingress {
    description    = "OpenSearch"
    protocol       = "TCP"
    port           = 9200
    v4_cidr_blocks = var.vpc_cidrs
  }
  ingress {
    description    = "ClickHouse HTTPS"
    protocol       = "TCP"
    port           = 8443
    v4_cidr_blocks = var.vpc_cidrs
  }
  egress {
    protocol       = "ANY"
    v4_cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "yandex_vpc_security_group" "k8s" {
  name       = "${local.name}-k8s"
  network_id = yandex_vpc_network.main.id

  ingress {
    description       = "Трафик внутри кластера и от балансировщика"
    protocol          = "ANY"
    predefined_target = "self_security_group"
  }
  ingress {
    description    = "Подсети узлов и подов"
    protocol       = "ANY"
    v4_cidr_blocks = concat(var.vpc_cidrs, ["10.112.0.0/16", "10.96.0.0/16"])
  }
  ingress {
    description       = "Health checks балансировщика"
    protocol          = "TCP"
    from_port         = 0
    to_port           = 65535
    predefined_target = "loadbalancer_healthchecks"
  }
  ingress {
    description    = "API Kubernetes (доступ ограничивается через CIDR офиса/VPN)"
    protocol       = "TCP"
    port           = 443
    v4_cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    protocol       = "ANY"
    v4_cidr_blocks = ["0.0.0.0/0"]
  }
}
