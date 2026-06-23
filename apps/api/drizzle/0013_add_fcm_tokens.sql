-- Migration: add fcm_tokens table for push notification device registrations
CREATE TABLE IF NOT EXISTS "fcm_tokens" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token"      varchar(500) NOT NULL UNIQUE,
  "platform"   varchar(20) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "fcm_tokens_user_idx"  ON "fcm_tokens" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "fcm_tokens_token_idx" ON "fcm_tokens" ("token");
