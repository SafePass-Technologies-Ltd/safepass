-- Drop the old trip_mode column from trips (enum no longer in schema)
ALTER TABLE "trips" DROP COLUMN IF EXISTS "trip_mode";--> statement-breakpoint

-- Drop the old trip_mode enum
DROP TYPE IF EXISTS "public"."trip_mode";--> statement-breakpoint

-- New enums
CREATE TYPE "public"."org_slot_status" AS ENUM('empty', 'token_pending', 'active');--> statement-breakpoint
CREATE TYPE "public"."invite_token_status" AS ENUM('active', 'expired', 'redeemed', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."scheduled_trip_status" AS ENUM('upcoming', 'missed', 'started', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."trip_tag_invite_status" AS ENUM('pending', 'accepted', 'declined', 'window_expired');--> statement-breakpoint

-- org_slots
CREATE TABLE IF NOT EXISTS "org_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" "org_slot_status" DEFAULT 'empty' NOT NULL,
	"member_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- invite_tokens
CREATE TABLE IF NOT EXISTS "invite_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"token" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_by" uuid,
	"redeemed_at" timestamp with time zone,
	"status" "invite_token_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- scheduled_trips
CREATE TABLE IF NOT EXISTS "scheduled_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"destination" jsonb NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"vehicle" jsonb,
	"label" varchar(255),
	"status" "scheduled_trip_status" DEFAULT 'upcoming' NOT NULL,
	"reminder_sent_at" timestamp with time zone,
	"linked_trip_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- trip_tag_invites
CREATE TABLE IF NOT EXISTS "trip_tag_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"initiator_user_id" uuid NOT NULL,
	"tagged_user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" "trip_tag_invite_status" DEFAULT 'pending' NOT NULL,
	"accepted_at" timestamp with time zone,
	"linked_trip_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint

-- Foreign keys: org_slots
DO $$ BEGIN
 ALTER TABLE "org_slots" ADD CONSTRAINT "org_slots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_slots" ADD CONSTRAINT "org_slots_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Foreign keys: invite_tokens
DO $$ BEGIN
 ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_slot_id_org_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."org_slots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Foreign keys: scheduled_trips
DO $$ BEGIN
 ALTER TABLE "scheduled_trips" ADD CONSTRAINT "scheduled_trips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_trips" ADD CONSTRAINT "scheduled_trips_linked_trip_id_trips_id_fk" FOREIGN KEY ("linked_trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Foreign keys: trip_tag_invites
DO $$ BEGIN
 ALTER TABLE "trip_tag_invites" ADD CONSTRAINT "trip_tag_invites_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trip_tag_invites" ADD CONSTRAINT "trip_tag_invites_initiator_user_id_users_id_fk" FOREIGN KEY ("initiator_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trip_tag_invites" ADD CONSTRAINT "trip_tag_invites_tagged_user_id_users_id_fk" FOREIGN KEY ("tagged_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trip_tag_invites" ADD CONSTRAINT "trip_tag_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trip_tag_invites" ADD CONSTRAINT "trip_tag_invites_linked_trip_id_trips_id_fk" FOREIGN KEY ("linked_trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Unique index on invite_tokens.token
CREATE UNIQUE INDEX IF NOT EXISTS "invite_tokens_token_idx" ON "invite_tokens" USING btree ("token");--> statement-breakpoint

-- Indexes on scheduled_trips
CREATE INDEX IF NOT EXISTS "scheduled_trips_user_idx" ON "scheduled_trips" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_trips_scheduled_at_idx" ON "scheduled_trips" USING btree ("scheduled_at");--> statement-breakpoint

-- Indexes on trip_tag_invites
CREATE INDEX IF NOT EXISTS "trip_tag_invites_trip_idx" ON "trip_tag_invites" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trip_tag_invites_tagged_user_idx" ON "trip_tag_invites" USING btree ("tagged_user_id");
