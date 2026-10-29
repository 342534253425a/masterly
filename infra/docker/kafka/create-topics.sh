#!/usr/bin/env bash
# Топики Kafka: имя, партиции, политика очистки, retention. Ключ сообщения = id агрегата.
# Прод-конфигурация тех же топиков — infra/terraform/kafka.tf (RF=3, min.insync.replicas=2).
set -euo pipefail

BOOTSTRAP="${BOOTSTRAP:-kafka:9092}"
KT=/opt/kafka/bin/kafka-topics.sh

create() {
  local name=$1 partitions=$2
  shift 2
  "$KT" --bootstrap-server "$BOOTSTRAP" --create --if-not-exists --topic "$name" \
    --partitions "$partitions" --replication-factor 1 "$@"
}

DAY=86400000

# Состояние агрегатов — компактированные топики (read-модели восстанавливаются с нуля)
create catalog.master.v1      6 --config cleanup.policy=compact --config min.compaction.lag.ms=60000
create reviews.rating.v1      3 --config cleanup.policy=compact

# Доменные события
create identity.account.v1    3 --config retention.ms=$((30 * DAY))
create leads.lead.v1          6 --config retention.ms=$((7 * DAY))
create reviews.review.v1      3 --config retention.ms=$((7 * DAY))
create messaging.message.v1   6 --config retention.ms=$((3 * DAY))
create media.asset.v1         3 --config retention.ms=$((7 * DAY))
create trust.moderation.v1    3 --config retention.ms=$((7 * DAY))

# Аналитика (поток в ClickHouse)
create analytics.events.v1    6 --config retention.ms=$((3 * DAY)) --config compression.type=zstd
create analytics.search.v1    6 --config retention.ms=$((3 * DAY)) --config compression.type=zstd

# Повторы и DLQ — для каждого потребляемого топика (как в kafka.tf). Топики общие для consumer-групп,
# получатель повтора указан в заголовке x-consumer-group.
for topic in identity.account.v1 catalog.master.v1 reviews.rating.v1 leads.lead.v1 reviews.review.v1 messaging.message.v1 media.asset.v1 trust.moderation.v1 analytics.events.v1 analytics.search.v1; do
  create "$topic.retry"  3 --config retention.ms=$((3 * DAY))
  create "$topic.dlq"    1 --config retention.ms=$((14 * DAY))
done

"$KT" --bootstrap-server "$BOOTSTRAP" --list
