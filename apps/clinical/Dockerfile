# syntax=docker/dockerfile:1
#
# The sample-data demo as a Next.js standalone server. Built by
# .github/workflows/deploy.yml for arm64 (the preview instance is Graviton).
#
# Build from the repository root: docker build -f apps/clinical/Dockerfile .
# The deps stage must copy every workspace's package.json, or npm ci can't
# resolve the workspaces. Only the root node_modules is copied into the
# build stage, because all dependencies are hoisted there.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/clinical/package.json apps/clinical/
COPY packages/api-client/package.json packages/api-client/
COPY packages/tokens/package.json packages/tokens/
RUN npm ci

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Read at build time and inlined into the client bundle, so it can't be set
# when the container starts. The demo always runs on sample data.
ENV NEXT_PUBLIC_USE_MOCK=true \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @mhai/clinical

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
# Fixed ids, so the host's feedback folder can be owned by this user.
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/apps/clinical/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/clinical/.next/static ./apps/clinical/.next/static
COPY --from=build /app/apps/clinical/public ./apps/clinical/public
USER nextjs
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/clinical/server.js"]
