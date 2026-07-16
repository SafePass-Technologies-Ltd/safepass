-- M-38 Account Deletion / A-27 Account Deletion Oversight & Legal Holds
-- Adds:
--   1. users.deleted_at        -- set when the anonymization cascade executes
--   2. account_deletion_requests -- one row per deletion attempt (audit trail)

-- users.deleted_at
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint

-- New enum for AccountDeletionRequest.status
CREATE TYPE "public"."account_deletion_status" AS ENUM('pending', 'cancelled', 'legal_hold', 'completed', 'force_deleted');--> statement-breakpoint

-- account_deletion_requests
CREATE TABLE IF NOT EXISTS "account_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "account_deletion_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"pre_flight_checks" jsonb NOT NULL,
	"legal_hold_reason" text,
	"legal_hold_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"force_deleted_by" uuid,
	"force_delete_reason" text,
	"hold_overridden_by" uuid,
	"hold_override_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Foreign keys: account_deletion_requests
DO $$ BEGIN
 ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_force_deleted_by_users_id_fk" FOREIGN KEY ("force_deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_hold_overridden_by_users_id_fk" FOREIGN KEY ("hold_overridden_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Indexes: account_deletion_requests
CREATE INDEX IF NOT EXISTS "account_deletion_requests_user_idx" ON "account_deletion_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_deletion_requests_status_idx" ON "account_deletion_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_deletion_requests_scheduled_for_idx" ON "account_deletion_requests" USING btree ("scheduled_for");
