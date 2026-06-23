-- Migration 0011: Add current_location column to trips table.
--
-- Persists the last GPS fix received from the mobile app so that DB-polling
-- clients (admin dashboard) always see the vehicle's current position, not
-- just the static origin. The column is nullable — it is null until the first
-- GPS update arrives for a trip.
--
-- Shape: { latitude, longitude, speed?, heading?, timestamp (ISO 8601) }

--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "current_location" jsonb;
