-- Migration 0012: Drop current_location from the trips table.
--
-- Reverts 0011. Per the architecture docs, current GPS position is stored in
-- DynamoDB (table: trip_locations) with a 60-second TTL — not in PostgreSQL.
-- Keeping it in PostgreSQL would create a secondary source of truth and
-- incur unnecessary write load on every GPS update.

--> statement-breakpoint
ALTER TABLE "trips" DROP COLUMN IF EXISTS "current_location";
