# Terraform: Yandex Cloud

Инфраструктура в российском облаке (152-ФЗ: персональные данные хранятся и обрабатываются в РФ).
Kubernetes — только для stateless-сервисов; данные — в managed-сервисах с репликацией по трём зонам.

| Файл | Что создаёт |
| --- | --- |
| `network.tf` | VPC, подсети в `ru-central1-a/b/d`, NAT-шлюз, security groups |
| `kubernetes.tf` | Managed Kubernetes (региональный мастер, Cilium, KMS для секретов), node groups по зонам с автоскейлингом |
| `postgres.tf` | PostgreSQL 17: кластеры по доменам, Odyssey (transaction pooling), PITR, БД и пользователь на сервис |
| `kafka.tf` | Kafka (KRaft) RF=3, min ISR=2, топики из `envs/*.tfvars`, пользователи с ACL по принципу наименьших привилегий |
| `datastores.tf` | Valkey/Redis Cluster (TLS, шарды), OpenSearch (manager/data-узлы), ClickHouse (шарды × реплики, Keeper) |
| `storage.tf` | Object Storage (KMS, lifecycle, CORS, object lock для бэкапов), Container Registry, Lockbox |

```bash
terraform init
terraform plan  -var-file=envs/staging.tfvars -var cloud_id=... -var folder_id=...
terraform apply -var-file=envs/production.tfvars -var cloud_id=... -var folder_id=...
```

В CI: `terraform fmt -check`, `terraform validate`, `tflint`, `checkov`, plan в комментарии к PR; apply — только из
защищённого окружения GitHub с ручным подтверждением.
