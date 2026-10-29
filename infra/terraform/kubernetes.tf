# Managed Kubernetes: региональный мастер (3 зоны), шифрование секретов KMS, Cilium (eBPF NetworkPolicy).
# Только stateless-нагрузка: хранилища — managed-сервисы ниже.

resource "yandex_kms_symmetric_key" "k8s" {
  name              = "${local.name}-k8s-secrets"
  default_algorithm = "AES_256"
  rotation_period   = "8760h"
  labels            = local.labels
}

resource "yandex_iam_service_account" "k8s_cluster" {
  name = "${local.name}-k8s-cluster"
}

resource "yandex_iam_service_account" "k8s_nodes" {
  name = "${local.name}-k8s-nodes"
}

resource "yandex_resourcemanager_folder_iam_member" "cluster_roles" {
  for_each  = toset(["k8s.clusters.agent", "vpc.publicAdmin", "load-balancer.admin", "alb.editor", "certificate-manager.certificates.downloader"])
  folder_id = var.folder_id
  role      = each.value
  member    = "serviceAccount:${yandex_iam_service_account.k8s_cluster.id}"
}

resource "yandex_resourcemanager_folder_iam_member" "nodes_registry" {
  folder_id = var.folder_id
  role      = "container-registry.images.puller"
  member    = "serviceAccount:${yandex_iam_service_account.k8s_nodes.id}"
}

resource "yandex_kms_symmetric_key_iam_member" "cluster_kms" {
  symmetric_key_id = yandex_kms_symmetric_key.k8s.id
  role             = "kms.keys.encrypterDecrypter"
  member           = "serviceAccount:${yandex_iam_service_account.k8s_cluster.id}"
}

resource "yandex_kubernetes_cluster" "main" {
  name                    = local.name
  network_id              = yandex_vpc_network.main.id
  service_account_id      = yandex_iam_service_account.k8s_cluster.id
  node_service_account_id = yandex_iam_service_account.k8s_nodes.id
  release_channel         = "STABLE"
  cluster_ipv4_range      = "10.112.0.0/16"
  service_ipv4_range      = "10.96.0.0/16"
  labels                  = local.labels

  master {
    version            = var.k8s_version
    public_ip          = true
    security_group_ids = [yandex_vpc_security_group.k8s.id]

    regional {
      region = "ru-central1"
      dynamic "location" {
        for_each = yandex_vpc_subnet.private
        content {
          zone      = location.value.zone
          subnet_id = location.value.id
        }
      }
    }

    maintenance_policy {
      auto_upgrade = true
      maintenance_window {
        day        = "tuesday"
        start_time = "01:00"
        duration   = "3h"
      }
    }

    master_logging {
      enabled                    = true
      kube_apiserver_enabled     = true
      cluster_autoscaler_enabled = true
      events_enabled             = true
      audit_enabled              = true
    }
  }

  network_implementation {
    cilium {}
  }

  kms_provider {
    key_id = yandex_kms_symmetric_key.k8s.id
  }

  depends_on = [yandex_resourcemanager_folder_iam_member.cluster_roles, yandex_kms_symmetric_key_iam_member.cluster_kms]
}

# Группа узлов на каждую зону: автоскейлер добавляет узлы в той зоне, где не хватает места
resource "yandex_kubernetes_node_group" "pools" {
  for_each = { for pair in setproduct(keys(var.node_groups), range(length(var.zones))) : "${pair[0]}-${pair[1]}" => { group = pair[0], zone_index = pair[1] } }

  cluster_id = yandex_kubernetes_cluster.main.id
  name       = "${each.value.group}-${substr(var.zones[each.value.zone_index], -1, 1)}"
  version    = var.k8s_version
  labels     = local.labels

  node_labels = merge(var.node_groups[each.value.group].labels, { pool = each.value.group })
  node_taints = var.node_groups[each.value.group].taints

  instance_template {
    platform_id = "standard-v3"

    resources {
      cores  = var.node_groups[each.value.group].cores
      memory = var.node_groups[each.value.group].memory
    }

    boot_disk {
      type = "network-ssd"
      size = var.node_groups[each.value.group].disk_size
    }

    network_interface {
      subnet_ids         = [yandex_vpc_subnet.private[each.value.zone_index].id]
      security_group_ids = [yandex_vpc_security_group.k8s.id]
      nat                = false
    }

    container_runtime {
      type = "containerd"
    }
  }

  scale_policy {
    auto_scale {
      min     = var.node_groups[each.value.group].min
      max     = var.node_groups[each.value.group].max
      initial = var.node_groups[each.value.group].min
    }
  }

  allocation_policy {
    location {
      zone = var.zones[each.value.zone_index]
    }
  }

  deploy_policy {
    max_expansion   = 2
    max_unavailable = 0
  }
}
