/**
 * Trip Auto-Complete Sweep Job.
 *
 * Periodically completes trips that reached their destination (per GPS,
 * see trip.service.ts's ARRIVAL_RADIUS_METERS/updateGpsPosition) but were
 * never manually marked 'completed' within the grace window
 * (AUTO_COMPLETE_DELAY_MINUTES) -- so staff/admins aren't left tracking
 * trips nobody's actually still on.
 */
import { autoCompleteArrivedTrips } from '../services/trip.service';

/**
 * Run one sweep pass. Logs a summary; never throws -- a failed sweep run
 * should not crash the process or the cron scheduler, just retry on the
 * next scheduled invocation (see scheduler.ts). Matches
 * runAccountDeletionSweep's error-handling shape.
 */
export async function runTripAutoCompleteSweep(): Promise<void> {
  try {
    const count = await autoCompleteArrivedTrips();
    if (count > 0) {
      console.log(`[trip-auto-complete-sweep] auto-completed ${count} trip(s)`);
    }
  } catch (err) {
    console.error('[trip-auto-complete-sweep] sweep run failed:', (err as Error)?.message);
  }
}
