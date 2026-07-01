#!/bin/sh
# SafePass API — container entrypoint.
#
# In production, ECS injects discrete DB_HOST/DB_PORT/DB_NAME (plain env
# vars) and DB_USER/DB_PASSWORD (Secrets Manager JSON-key-selector secrets)
# rather than a single DATABASE_URL — see
# terraform/environments/production/main.tf's ECS module wiring for why
# (AWS's RDS-managed master credentials secret only holds username/password,
# and ECS's `secrets` mechanism has no way to concatenate values into one
# connection string). Assemble DATABASE_URL here, once, before starting the
# app, so apps/api/src/env.ts's schema (which validates a single
# DATABASE_URL) doesn't need to change and local dev (which sets
# DATABASE_URL directly via .env / docker-compose) is unaffected.
set -e

if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME:-safepass}"
fi

exec "$@"
