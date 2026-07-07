/**
 * Redis (Upstash) pub/sub client — cross-task WebSocket broadcast relay.
 *
 * ECS runs multiple API tasks (see `ecs_desired_count` in
 * terraform/environments/production/variables.tf) behind a single ALB, and
 * websocket.service.ts's connection registry is in-memory, per task — a
 * client connected to task A is completely invisible to task B. Without a
 * shared relay, a broadcast (GPS update, chat message, emergency alert)
 * only reaches subscribers whose WebSocket connection happens to be on the
 * SAME task that originated the event, silently dropping delivery to
 * anyone connected to another task. This matches architecture.md's
 * documented design ("any server can handle any connection") which this
 * module is what actually makes true.
 *
 * Degrades gracefully: if UPSTASH_REDIS_URL isn't configured (local dev,
 * or Upstash not yet provisioned), publish()/subscribe() become no-ops and
 * the app falls back to single-task, in-memory-only delivery — the same
 * behavior this codebase had before this module existed. Non-fatal by
 * design, consistent with how this app treats every other optional
 * external service (see apps/api/src/env.ts's resolveExternalServices).
 */
import Redis from 'ioredis';
import { env } from '../env';

// NOTE: UPSTASH_REDIS_URL must be the TCP "Redis Connect" connection string
// Upstash provides (rediss://default:<password>@<host>:<port>) — NOT the
// REST API URL (https://<host>) shown alongside it in the Upstash console.
// ioredis speaks the native Redis protocol over that TCP connection; it
// cannot use the HTTP REST endpoint. If the wrong one is configured here,
// connection just fails (logged below) and this module silently no-ops,
// same as if it were unset entirely.

let publisher: Redis | null = null;
let subscriberClient: Redis | null = null;

function getPublisher(): Redis | null {
  if (!env.UPSTASH_REDIS_URL) return null;
  if (!publisher) {
    publisher = new Redis(env.UPSTASH_REDIS_URL);
    publisher.on('error', (err: Error) => {
      console.error('[Redis] publisher connection error:', err.message);
    });
  }
  return publisher;
}

/**
 * Publishes a JSON-serializable payload to `channel`. No-op (resolves
 * immediately) if Redis isn't configured — callers should not depend on
 * this for correctness on a single-task deployment, only as the mechanism
 * that makes multi-task delivery work.
 */
export async function publish(channel: string, payload: unknown): Promise<void> {
  const client = getPublisher();
  if (!client) return;

  try {
    await client.publish(channel, JSON.stringify(payload));
  } catch (err) {
    console.error('[Redis] publish failed:', (err as Error).message);
  }
}

/**
 * Subscribes to `channel`, invoking `handler` with every message received
 * on it — including messages this same process published (callers must
 * filter those out themselves, e.g. via an origin-instance tag in the
 * payload, since ioredis's pub/sub has no concept of "don't echo to
 * sender"). Returns false (and does nothing) if Redis isn't configured.
 *
 * Uses a dedicated connection, separate from the publisher above — once an
 * ioredis connection issues SUBSCRIBE, it can only issue further
 * pub/sub commands, so it can never be shared with a connection used for
 * regular PUBLISH calls.
 */
export function subscribe(channel: string, handler: (payload: string) => void): boolean {
  if (!env.UPSTASH_REDIS_URL) return false;

  if (!subscriberClient) {
    subscriberClient = new Redis(env.UPSTASH_REDIS_URL);
    subscriberClient.on('error', (err: Error) => {
      console.error('[Redis] subscriber connection error:', err.message);
    });
  }

  subscriberClient.subscribe(channel).catch((err: Error) => {
    console.error('[Redis] subscribe failed:', err.message);
  });

  subscriberClient.on('message', (receivedChannel: string, message: string) => {
    if (receivedChannel === channel) handler(message);
  });

  return true;
}
