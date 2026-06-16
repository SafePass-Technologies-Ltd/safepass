CREATE TYPE "public"."role_upgrade_requested_role" AS ENUM('admin', 'super_admin', 'corporate_admin', 'transport_partner', 'monitoring_officer');--> statement-breakpoint
CREATE TYPE "public"."role_upgrade_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_upgrade_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_role" "role_upgrade_requested_role" NOT NULL,
	"organization_id" uuid,
	"status" "role_upgrade_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "role_upgrade_requests" ADD CONSTRAINT "role_upgrade_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "role_upgrade_requests" ADD CONSTRAINT "role_upgrade_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "role_upgrade_requests" ADD CONSTRAINT "role_upgrade_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_upgrade_requests_status_idx" ON "role_upgrade_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_upgrade_requests_user_idx" ON "role_upgrade_requests" USING btree ("user_id");