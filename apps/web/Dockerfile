# syntax=docker/dockerfile:1.7
# Next.js в режиме standalone: в образ попадает только трассированный рантайм (~120 МБ вместо гигабайта node_modules).

ARG NODE_VERSION=22.15.0

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /repo

FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.10 prune @masterly/web --docker

FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
ENV NEXT_OUTPUT=standalone API_MODE=live
RUN pnpm turbo run build --filter=@masterly/web...

FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nonroot:nonroot /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nonroot:nonroot /repo/apps/web/public ./apps/web/public
USER nonroot
EXPOSE 3000
CMD ["apps/web/server.js"]
