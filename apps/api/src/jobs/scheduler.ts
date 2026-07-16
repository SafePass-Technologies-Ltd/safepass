/**
 * Scheduled Jobs — lightweight cron scheduler co-located with the API
 * process, per architecture.md's "Scheduled Notification Jobs" component
 * ("a lightweight cron job co-located with the API service, e.g. via
 * node-cron").
 *
 * A previous version of this module scheduled a fixed-window (12-month)
 * trip-archive purge job; that was removed when the retention policy
 * changed to be account-lifecycle-tied instead of time-window-tied (see
 * docs/SafePass/risk_log.md R-013's revised decision, and
 * trip-archive.service.ts's retention comment). This time, node-cron is
 * genuinely load-bearing again: M-38 Account Deletion's 14-day cooling-off
 * period is itself a deferred/scheduled execution -- something has to
 * periodically check which requests are now due and act on them. There is
 * no way to make that "check on next login" or purely event-driven, since
 * the whole point is it fires with NO user action after the window elapses.
 */
import cron from 'node-cron';
import { runAccountDeletionSweep } from './account-deletion-sweep.job';

/**
 * Start all scheduled jobs. Safe to call once at boot. `unref: true`
 * ensures a pending scheduled run never keeps the Node process alive on its
 * own (matches the flush-interval `unref()` pattern in
 * trip-archive.service.ts), so this doesn't interfere with graceful
 * shutdown or test runner exit.
 */
export function startScheduledJobs(): void {
  // M-38: sweep for due account-deletion requests. Hourly matches the cadence
  // suggested in user_flow.md Flow 10c ("Periodic sweep (e.g. hourly)") --
  // frequent enough that a request rarely sits due-but-unprocessed for long,
  // without needing sub-hour precision on a 14-day window.
  cron.schedule('0 * * * *', () => {
    void runAccountDeletionSweep();
  }, { name: 'account-deletion-sweep', unref: true });

  console.log('[scheduler] scheduled jobs started (account-deletion-sweep: hourly)');
}
