/**
 * Push Notification Service — Firebase Cloud Messaging (FCM) delivery.
 *
 * Provides two public helpers:
 *   - sendPushToUser   — send to all registered devices for one user
 *   - sendPushToRole   — fan-out to all users with a given database role
 *
 * Both functions silently handle:
 *   - Users / roles with no registered FCM tokens (no-op).
 *   - Stale tokens (messaging/registration-token-not-registered) — deleted
 *     automatically after each multicast so the table stays clean.
 *   - FCM send failures for individual tokens — logged but do not throw.
 */

import { eq, inArray } from 'drizzle-orm';
import { admin } from './firebase';
import { db } from '../db';
import { fcmTokens, users } from '../db/schema';

/** Maximum token batch per FCM sendEachForMulticast call. */
const FCM_BATCH_LIMIT = 500;

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Send a push notification to all registered devices for a single user.
 *
 * @param userId  - UUID of the target user.
 * @param title   - Notification title shown in the system tray.
 * @param body    - Notification body text.
 * @param data    - Optional key-value payload forwarded to the app.
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  const rows = await db
    .select({ token: fcmTokens.token })
    .from(fcmTokens)
    .where(eq(fcmTokens.userId, userId));

  if (rows.length === 0) return;

  const tokens = rows.map((r) => r.token);
  await _sendMulticast(tokens, title, body, data);
}

/**
 * Fan-out a push notification to all users with a given role.
 *
 * Fetches all FCM tokens for users whose `role` column matches the given
 * value, then sends in FCM_BATCH_LIMIT-sized batches to stay within the
 * FCM API limit.
 *
 * @param role  - User role value (e.g. 'monitoring_officer').
 * @param title - Notification title.
 * @param body  - Notification body.
 * @param data  - Optional key-value payload.
 */
export async function sendPushToRole(
  role: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  // Subquery: get IDs of all users with this role.
  const usersWithRole = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, role as typeof users.$inferSelect['role']));

  if (usersWithRole.length === 0) return;

  const userIds = usersWithRole.map((u) => u.id);

  const rows = await db
    .select({ token: fcmTokens.token })
    .from(fcmTokens)
    .where(inArray(fcmTokens.userId, userIds));

  if (rows.length === 0) return;

  const tokens = rows.map((r) => r.token);
  await _sendMulticast(tokens, title, body, data);
}

// ────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────

/**
 * Send a multicast notification to a list of FCM tokens, automatically
 * chunking into FCM_BATCH_LIMIT-sized batches.
 *
 * After each batch, any tokens that returned a
 * `messaging/registration-token-not-registered` error are deleted from the
 * database in bulk so we don't attempt them again.
 */
async function _sendMulticast(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  // Process in batches of FCM_BATCH_LIMIT.
  for (let i = 0; i < tokens.length; i += FCM_BATCH_LIMIT) {
    const batch = tokens.slice(i, i + FCM_BATCH_LIMIT);

    try {
      const result = await admin.messaging().sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        data: data ?? {},
        // Android-specific channel for proper importance/sound handling.
        android: {
          priority: 'high',
          notification: {
            channelId: 'safepass_alerts',
            priority: 'high',
          },
        },
      });

      // Collect tokens FCM reports as no longer registered.
      const staleTokens: string[] = [];
      result.responses.forEach((resp, idx) => {
        if (
          !resp.success &&
          resp.error?.code === 'messaging/registration-token-not-registered'
        ) {
          staleTokens.push(batch[idx]!);
        }
      });

      if (staleTokens.length > 0) {
        await db
          .delete(fcmTokens)
          .where(inArray(fcmTokens.token, staleTokens));

        console.log(
          `[Push] Removed ${staleTokens.length} stale FCM token(s)`
        );
      }

      const successCount = result.responses.filter((r) => r.success).length;
      console.log(
        `[Push] Sent batch ${Math.ceil(i / FCM_BATCH_LIMIT) + 1}: ` +
        `${successCount}/${batch.length} successful`
      );
    } catch (err) {
      // Non-fatal — a push delivery failure must never block a trip action.
      console.error('[Push] FCM multicast error:', err);
    }
  }
}
