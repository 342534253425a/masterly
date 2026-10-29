# Документация Masterly

| Документ | О чём |
|---|---|
| [Обзор архитектуры](architecture/overview.md) | Контекст и контейнеры (C4), сервисы, ключевые сценарии, стек |
| [Планирование мощностей](architecture/capacity-planning.md) | Модель нагрузки «⅓ Avito», расчёт ресурсов по сервисам и хранилищам, план нагрузочных тестов |
| [Данные](architecture/data.md) | БД на сервис, схемы и индексы, секционирование, кэширование, миграции, бэкапы, сроки хранения |
| [События](architecture/events.md) | Топики Kafka, конверт CloudEvents, outbox/inbox, повторы и DLQ, эволюция схем |
| [Устойчивость](architecture/resilience.md) | SLO, дедлайны, ретраи, circuit breaker, bulkhead, деградация, DR, chaos-тесты |
| [Безопасность и приватность](architecture/security-privacy.md) | 152-ФЗ, минимизация ПДн, шифрование, аутентификация, RBAC, контроль контактов, права субъекта |
| [Наблюдаемость](architecture/observability.md) | OpenTelemetry, каталог метрик, SLO и burn-rate алерты, ранбуки |
| [ADR](adr/README.md) | Журнал архитектурных решений |
| [Дорожная карта](roadmap.md) | Этапы продукта и платформы, что сознательно не делаем |

Инфраструктура: [`infra/`](../infra) — Docker Compose, Helm, Terraform, Argo CD; CI/CD — [`.github/workflows`](../.github/workflows);
нагрузочные тесты — [`tests/load`](../tests/load). Согласованность конфигураций проверяет `pnpm validate:infra`.
