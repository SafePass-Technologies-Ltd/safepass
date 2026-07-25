-- Adds trips.arrived_at: set the first time a GPS ping lands within the
-- arrival radius of the trip's destination (see trip.service.ts's
-- updateGpsPosition and ARRIVAL_RADIUS_METERS). Powers the "you've
-- arrived" push notification and the auto-complete-after-10-minutes sweep
-- (see jobs/trip-auto-complete-sweep.job.ts). Distinct from the existing
-- actual_arrival column, which is set later, when the trip is actually
-- marked 'completed'.
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "arrived_at" timestamp with time zone;
