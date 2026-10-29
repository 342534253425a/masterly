terraform {
  required_version = ">= 1.10"

  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = "~> 0.140"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Состояние — в Yandex Object Storage (S3-совместимый бэкенд), блокировка через lock-файл (TF >= 1.10)
  backend "s3" {
    endpoints                   = { s3 = "https://storage.yandexcloud.net" }
    bucket                      = "masterly-terraform-state"
    key                         = "masterly/terraform.tfstate"
    region                      = "ru-central1"
    use_lockfile                = true
    skip_region_validation      = true
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}

provider "yandex" {
  cloud_id  = var.cloud_id
  folder_id = var.folder_id
  zone      = var.zones[0]
}
