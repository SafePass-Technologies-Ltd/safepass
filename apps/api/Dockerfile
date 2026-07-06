# SafePass API — production image
#
# Multi-stage build: install workspace deps + build in a full Node image,
# then copy only the built output + production deps into a slim runtime
# image. Uses pnpm (per repo convention) with Turborepo-aware workspace
# installs so `@safepass/shared` (a workspace package) is included correctly.
#
# Build context MUST be the repo root (not apps/api/), e.g.:
#   docker build -f apps/api/Dockerfile -t safepass-api:latest .
# This is required because pnpm workspaces need the root
# pnpm-workspace.yaml, root lockfile, and packages/shared source.

# --- Stage 1: base ---------------------------------------------------------
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.32.0 --activate
WORKDIR /repo

# --- Stage 2: dependencies (cached separately from source for faster rebuilds) ---
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
# --frozen-lockfile: fail the build rather than silently drift from the
# committed lockfile (matches CI's install behavior).
RUN pnpm install --frozen-lockfile

# --- Stage 3: build ---------------------------------------------------------
FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
# Must fail the build (not swallow errors) -- apps/api's package.json
# points @safepass/shared's "main"/"types" at ./dist/*, so if this build
# fails silently, the API resolves to a nonexistent/stale dist and crashes
# at runtime (ERR_MODULE_NOT_FOUND / ERR_UNSUPPORTED_DIR_IMPORT) instead of
# failing fast here in CI.
RUN pnpm --filter @safepass/shared build
RUN pnpm --filter @safepass/api build

# --- Stage 4: production runtime -------------------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.32.0 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
# Production-only deps — smaller final image, no devDependencies (tsx,
# vitest, typescript, etc.) carried into the running container.
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/packages/shared ./packages/shared
# db/migrate.ts (compiled to dist/db/migrate.js) reads SQL migration files
# from './drizzle' at runtime (relative to WORKDIR /repo/apps/api below) --
# that folder is source, not compiled output, so tsc never puts it in
# dist/. Without this, `node dist/db/migrate.js` fails inside the deployed
# container with "ENOENT: no such file or directory, scandir './drizzle'".
COPY --from=build /repo/apps/api/drizzle ./apps/api/drizzle

WORKDIR /repo/apps/api

# Matches the ALB/ECS health check target group's expected port (see
# terraform/modules/ecs container_port variable, default 3000).
EXPOSE 3000

# Runs as a non-root user for defense-in-depth (per architecture.md security
# posture — this handles GPS/PII/emergency data).
RUN useradd --system --uid 10001 safepass
USER safepass

CMD ["node", "dist/server.js"]
