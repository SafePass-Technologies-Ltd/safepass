-- M-35: Vehicle Info on Trip
-- Adds vehicle_description, vehicle_copied_from_initiator, and
-- vehicle_source_initiator_name columns to the trips table.

ALTER TABLE "trips"
  ADD COLUMN IF NOT EXISTS "vehicle_description" text,
  ADD COLUMN IF NOT EXISTS "vehicle_copied_from_initiator" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "vehicle_source_initiator_name" text;
