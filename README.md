# Masterly

Платформа поиска проверенных мастеров (MVP — ремонт смартфонов в Москве, Санкт-Петербурге и Краснодаре).
Пользователь описывает проблему своими словами («разбил экран айфон 13 про») — платформа понимает услугу и модель,
показывает мастеров рядом с честными ценами, сравнение, гарантию и отзывы. **Платёжного интерфейса нет и не будет**:
оплата — напрямую мастеру.

## Быстрый старт (демо без инфраструктуры)

```bash
corepack enable
pnpm install
pnpm build:packages
pnpm --filter @masterly/web dev        # http://localhost:3100
pnpm --filter @masterly/web storybook  # http://localhost:6006
```

Демо-режим (`API_MODE=mock`) обслуживает встроенный контрактный мок-бэкенд. Вход за любую роль — кнопка «Демо-режим»
в шапке (клиент / мастер / администратор), код OTP в демо — `1234`.

## Что внутри

| Слой | Технологии |
| --- | --- |
| Монорепо | pnpm workspaces + catalogs, Turborepo, TypeScript 6 (strict) |
| Web | Next.js 16 (App Router, RSC, React Compiler, Turbopack), React 19, **Feature-Sliced Design** (+ Steiger), TanStack Query 5 (SSR-гидратация), nuqs (состояние фильтров в URL), Zustand, Tailwind CSS 4, Radix UI, Motion, MapLibre GL, next-intl (ru; en/zh — beta), next-themes, react-hook-form + zod, PWA (manifest + service worker), JSON-LD, sitemap |
| Контракты | `@masterly/contracts` — zod-реестр маршрутов: типобезопасный клиент, валидация ответов, генерация OpenAPI 3.1 |
| Мок-бэкенд | `@masterly/mock-api` — MSW-хендлеры по контрактам: демо-режим, Storybook, тесты (`getResponse`) |
| Доменное ядро | `@masterly/kernel` — NLP-классификатор «проблема → услуга + модель», SimHash + LSH (накрутка отзывов), триграммы (дубликаты), geohash, UUIDv7, расписания и тихие часы |
| gRPC/Protobuf | `@masterly/proto` — buf lint/breaking, ts-proto (NestJS), CloudEvents-конверт для Kafka |
| Тесты | Vitest (kernel, fixtures, contracts, mock-api, web), Testing Library, Playwright (e2e-сценарий), Storybook 10 + a11y |
| Инфраструктура | Docker Compose (весь стек локально: PostGIS, Kafka KRaft, Valkey, OpenSearch, ClickHouse, MinIO, OTel, Grafana), Helm-чарт сервисов (HPA, KEDA, PDB, NetworkPolicy, Gateway API, External Secrets), Terraform для Yandex Cloud (3 зоны), Argo CD |
| CI/CD | GitHub Actions: turbo `--affected`, buf breaking, Playwright, Chromatic, kubeconform, tflint, Trivy, CodeQL; образы с SBOM, provenance и подписью cosign; выкладка staging → k6 smoke → production |
| Нагрузка | k6: профили smoke / load / stress / spike / soak, пороги = SLO |

## Структура

```
apps/web            Next.js (app/ — только роутинг, src/ — слои FSD: app, pages, widgets, features, entities, shared)
apps/gateway        API Gateway (Fastify): маршруты из реестра контрактов → gRPC; JWT, RBAC, GCRA, идемпотентность, OpenAPI
services/*          10 доменных сервисов на NestJS: identity, catalog, search, leads, reviews, messaging, notifications, media, analytics, trust
packages/platform   платформа сервисов: конфиг, логи, метрики, OTel, health, БД и миграции, outbox/inbox, Kafka, Redis, resilience, gRPC
packages/kernel     доменные алгоритмы (общие для фронта и сервисов)
packages/fixtures   детерминированные данные: 208 мастеров, 87 моделей, 14 услуг
packages/contracts  REST-контракты (zod) + OpenAPI
packages/mock-api   контрактный мок-бэкенд на MSW
packages/proto      gRPC-сервисы и события Kafka (Protobuf)
infra/              docker (Compose и конфиги), helm (чарт + values), k8s (платформа, Argo CD), terraform (Yandex Cloud)
tests/load          нагрузочные сценарии k6
docs/               архитектура, ADR, дорожная карта
scripts/            validate-infra.mjs — согласованность портов, топиков и ACL между Compose, Helm и Terraform
```

Локальный стек с инфраструктурой: `pnpm infra:up` (хранилища), `pnpm stack:up` (всё, включая наблюдаемость:
Grafana — http://localhost:3001, Kafka UI — http://localhost:8085).

## Документация

[Обзор архитектуры](docs/architecture/overview.md) · [Мощности: расчёт на ⅓ Avito](docs/architecture/capacity-planning.md) ·
[Данные](docs/architecture/data.md) · [События](docs/architecture/events.md) · [Устойчивость](docs/architecture/resilience.md) ·
[Безопасность и 152-ФЗ](docs/architecture/security-privacy.md) · [Наблюдаемость](docs/architecture/observability.md) ·
[ADR](docs/adr/README.md) · [Дорожная карта](docs/roadmap.md)

## Статус

Готово и проверено тестами:
- **фронтенд** — 34 маршрута: поиск с картой, профиль, сравнение, заявки, чат, избранное, настройки, SEO-лендинги,
  кабинет мастера (9 разделов), админка (6 разделов); Storybook, unit- и e2e-тесты;
- **платформа** `@masterly/platform`: transactional outbox с суточными секциями, inbox, Kafka-шина с повторами и DLQ,
  read-through кэш (single-flight, XFetch), GCRA, circuit breaker с бюджетом повторов, gRPC с дедлайнами, graceful shutdown;
- **10 доменных сервисов**: у каждого SQL-миграции с индексами под запросы, gRPC через NestJS, события через outbox,
  обработка удаления аккаунта; тесты на настоящем PostgreSQL (PGlite) через настоящий gRPC-сервер;
- **API Gateway** — все 77 маршрутов контракта подключены к сервисам (тест проверяет, что 501 не осталось);
  **сквозной тест**: 9 сервисов в одном процессе, сценарии «поиск → вход по коду → заявка → ответ мастера → выбор →
  выполнение → отзыв → чат», SEO и сравнение, личный кабинет, кабинет мастера (счёт → оплата → Pro), админка;
  каждый ответ проверяется схемой контракта;
- **живой чат**: WebSocket в messaging (`wss://masterly.ru/ws`), сигналы между подами через Redis Pub/Sub,
  вход по access-cookie с проверкой JWT и Origin; фронтенд обновляет данные по сигналу, опрос — только страховка;
- **доставка уведомлений**: email (SMTP / Postbox, локально Mailpit), SMS (HTTP-шлюз), Web Push (VAPID) с подпиской
  из настроек и сервис-воркером PWA;
- **инфраструктура**: Compose, Helm, Terraform, CI/CD, k6; `pnpm validate:infra` сверяет порты, топики и ACL;
- архитектурная документация и 12 ADR.

Осталось (честно):
- перед запуском сгенерировать пару VAPID (`npx web-push generate-vapid-keys`): публичный ключ — в
  `infra/helm/values/notifications.yaml`, приватный — в Lockbox; без них notifications в production не стартует;
- Telegram как канал уведомлений: выбор сохраняется в настройках, но бота-провайдера пока нет;
- блокировка пользователя отзывает refresh-сессии сразу, но выданный access-токен действует до 15 минут;
- Docker, Helm и Terraform на этой машине проверены только статически (YAML, JSON, согласованность). Полную проверку
  (`docker compose config`, kubeconform, `terraform validate`) выполняет CI.
