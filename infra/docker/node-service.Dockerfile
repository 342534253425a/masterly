# syntax=docker/dockerfile:1.7
# Единый образ для всех Node.js-микросервисов монорепозитория:
#   docker build -f infra/docker/node-service.Dockerfile --build-arg SERVICE=@masterly/leads --build-arg SERVICE_PATH=services/leads .
# Стадии: prune (только нужные пакеты) → install (кэш pnpm store) → build (turbo) → deploy (prod-зависимости) → distroless.

ARG NODE_VERSION=22.15.0

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true TURBO_TELEMETRY_DISABLED=1
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /repo

FROM base AS prune
ARG SERVICE
COPY . .
RUN pnpm dlx turbo@2.11.10 prune "${SERVICE}" --docker

FROM base AS build
ARG SERVICE
ARG SERVICE_PATH
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune /repo/out/full/ .
RUN pnpm turbo run build --filter="${SERVICE}..." \
 && pnpm --filter "${SERVICE}" deploy --prod --legacy /out \
 && cp -r "${SERVICE_PATH}/dist" /out/dist \
 && (cp -r "${SERVICE_PATH}/migrations" /out/migrations 2>/dev/null || true)

# Distroless: нет shell и пакетного менеджера — минимальная поверхность атаки; non-root по умолчанию
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
ARG SERVICE
LABEL org.opencontainers.image.source="https://github.com/masterly/masterly" \
      org.opencontainers.image.description="Masterly ${SERVICE}"
ENV NODE_ENV=production NODE_OPTIONS="--enable-source-maps --max-old-space-size=320"
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /out .
USER nonroot
EXPOSE 50051 8080 9464
CMD ["--import", "./dist/telemetry.js", "dist/main.js"]
