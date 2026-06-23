-- Migration: subscription_requests table + supporting enum (C-20, T-20)
--
-- Adds:
--   1. subscription_request_status enum
--   2. subscription_requests table
--   3. updated_at column on organizations (needed for plan activation writes)

-- 1. Status enum for subscription requests
DO $$ BEGIN
  CREATE TYPE "public"."subscription_request_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. updated_at on organizations (defaultNow, backfill existing rows)
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();

-- 3. subscription_requests table
CREATE TABLE IF NOT EXISTS "subscription_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "requested_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "requested_plan" "subscription_plan" NOT NULL,
  "requested_slot_count" integer NOT NULL,
  "notes" text,
  "status" "subscription_request_status" NOT NULL DEFAULT 'pending',
  "reviewed_by_user_id" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sub_requests_org_idx" ON "subscription_requests" ("org_id");
CREATE INDEX IF NOT EXISTS "sub_requests_status_idx" ON "subscription_requests" ("status");
