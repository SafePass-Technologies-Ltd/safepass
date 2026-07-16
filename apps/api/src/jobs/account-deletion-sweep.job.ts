/**
 * Account Deletion Sweep Job — M-38 Flow 10c background execution.
 *
 * Periodically scans for AccountDeletionRequest rows whose 14-day
 * cooling-off window (`scheduled_for`) has elapsed and either executes the
 * deletion cascade or places the request on `legal_hold`, per
 * account-deletion.service.ts's runDeletionSweep.
 */
import { runDeletionSweep } from '../services/account-deletion.service';

/**
 * Run one sweep pass. Logs a summary; never throws -- a failed sweep run
 * should not crash the process or the cron scheduler, just retry on the
 * next scheduled invocation (see scheduler.ts).
 */
export async function runAccountDeletionSweep(): Promise<void> {
  try {
    const { executed, heldOnLegalHold } = await runDeletionSweep();
    if (executed > 0 || heldOnLegalHold > 0) {
      console.log(
        `[account-deletion-sweep] executed ${executed} deletion(s), placed ${heldOnLegalHold} on legal_hold`
      );
    }
  } catch (err) {
    console.error('[account-deletion-sweep] sweep run failed:', (err as Error)?.message);
  }
}
