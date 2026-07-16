-- A-26 Trip Persistence & Archival (Yearly Compliance Log + Route Replay)
-- Adds the two new durable PostgreSQL writes described in
-- docs/SafePass/architecture.md's "Trip Data Persistence" section:
--   1. trip_summaries        -- one row per trip, written at completion/cancellation
--   2. trip_location_history -- sampled route breadcrumbs, admin/super_admin read-only
-- Also adds a small status-transition counter column to trips (see
-- apps/api/src/db/schema/types.ts's StatusTransitionCounts doc comment).
--
-- Retention (R-013, revised): both tables are retained indefinitely by
-- default -- no fixed-duration/scheduled purge job. Retention is tied to
-- account lifecycle instead: both tables' trip_id FKs use ON DELETE CASCADE
-- so they're cleaned up automatically whenever a trip row is deleted
-- (e.g. by a future account-deletion flow that deletes a user's trips).

-- New enum for TripSummary.final_status
CREATE TYPE "public"."trip_summary_final_status" AS ENUM('completed', 'cancelled');--> statement-breakpoint

-- trips: track 'delayed' re-entries (the only non-terminal status with no
-- dedicated durable table of its own -- emergency/escalated counts are
-- derived from emergency_events/escalations at read time instead).
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "status_transition_counts" jsonb DEFAULT '{"delayed":0}'::jsonb NOT NULL;--> statement-breakpoint

-- trip_summaries
CREATE TABLE IF NOT EXISTS "trip_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"total_distance_km" double precision,
	"duration_seconds" integer,
	"average_speed_kmh" double precision,
	"max_speed_kmh" double precision,
	"status_transition_counts" jsonb DEFAULT '{"delayed":0,"emergency":0,"escalated":0}'::jsonb NOT NULL,
	"incident_count" integer DEFAULT 0 NOT NULL,
	"incident_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"destination_delta_meters" double precision,
	"final_status" "trip_summary_final_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_summaries_trip_id_unique" UNIQUE("trip_id")
);
--> statement-breakpoint

-- trip_location_history
CREATE TABLE IF NOT EXISTS "trip_location_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"speed" double precision,
	"heading" double precision,
	"recorded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Foreign keys: trip_summaries
-- ON DELETE CASCADE: retention is tied to account lifecycle (R-013,
-- revised) -- this row is deleted automatically whenever its trip is.
DO $$ BEGIN
 ALTER TABLE "trip_summaries" ADD CONSTRAINT "trip_summaries_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Foreign keys: trip_location_history
-- ON DELETE CASCADE: same rationale as trip_summaries above.
DO $$ BEGIN
 ALTER TABLE "trip_location_history" ADD CONSTRAINT "trip_location_history_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Indexes: trip_summaries
CREATE UNIQUE INDEX IF NOT EXISTS "trip_summaries_trip_idx" ON "trip_summaries" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trip_summaries_created_idx" ON "trip_summaries" USING btree ("created_at");--> statement-breakpoint

-- Indexes: trip_location_history
CREATE INDEX IF NOT EXISTS "trip_location_history_trip_idx" ON "trip_location_history" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trip_location_history_trip_recorded_idx" ON "trip_location_history" USING btree ("trip_id","recorded_at");
