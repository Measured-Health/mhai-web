# syntax=docker/dockerfile:1
#
# The platform admin app (apps/platform) as a Next.js standalone server, served
# at platforms.measured-health.org behind an IP allow list. Built by
# .github/workflows/deploy.yml for arm64 (the preview instance is Graviton).
#
# Build from the repository root: docker build -f apps/platform/Dockerfile .
# The deps stage must copy every workspace's package.json, or npm ci can't
# resolve the workspaces. Only the root node_modules is copied into the
# build stage, because all dependencies are hoisted there.
#
# The server needs PLATFORM_SESSION_SECRET (32+ characters) when it starts.
# It is never baked into the image: compose passes it from the host's .env.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/clinical/package.json apps/clinical/
COPY apps/platform/package.json apps/platform/
COPY packages/api-client/package.json packages/api-client/
COPY packages/ui/package.json packages/ui/
COPY packages/tokens/package.json packages/tokens/
RUN npm ci

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Read at build time and inlined into the client bundle. The preview always
# runs on sample data.
ENV NEXT_PUBLIC_USE_MOCK=true \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @mhai/platform

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/apps/platform/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/platform/.next/static ./apps/platform/.next/static
COPY --from=build /app/apps/platform/public ./apps/platform/public
USER nextjs
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/sign-in').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/platform/server.js"]
