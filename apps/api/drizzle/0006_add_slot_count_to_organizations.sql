ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "slot_count" integer NOT NULL DEFAULT 0;
