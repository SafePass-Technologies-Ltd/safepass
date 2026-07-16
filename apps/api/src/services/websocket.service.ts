/**
 * WebSocket Service — real-time connection management, broadcasting,
 * and event delivery for active trip monitoring, messaging, and emergencies.
 *
 * Uses the `ws` package directly alongside the Hono HTTP server.
 * The HTTP server upgrades WebSocket connections to the WS server.
 *
 * Architecture:
 *   - Connection registry (who's connected, to what) is in-memory, LOCAL TO
 *     THIS TASK ONLY — ECS runs multiple tasks behind one ALB, and a given
 *     process only ever knows about its own directly-connected clients.
 *   - Every connection is authenticated via JWT on upgrade.
 *   - Clients subscribe to trip channels to receive GPS/message/status events.
 *   - Cross-task delivery: every broadcast* export below both (a) delivers
 *     to this task's own local connections, AND (b) publishes to a shared
 *     Redis channel (see redis.service.ts) that every task subscribes to,
 *     so a client connected to ANY task receives events regardless of
 *     which task originated them. Falls back to local-only delivery if
 *     Redis isn't configured (single-task-equivalent behavior).
 */

import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import { verifyAccessToken } from '../middleware/auth';
import type { JwtPayload } from '../middleware/auth';
import { getAllTripLocations } from './dynamo.service';
import { publish, subscribe } from './redis.service';
// trip.service is imported lazily inside the subscribe_all_trips handler to
// avoid a circular dependency (trip.service → websocket.service → trip.service).

/** Unique per-process ID, tagged on every published cross-instance message so
 * a task can recognize (and skip) its own publishes when they echo back via
 * the Redis subscription — every task subscribes to the same channel,
 * including the one that published, since there's no per-publisher opt-out
 * in Redis pub/sub itself. */
const INSTANCE_ID = randomUUID();

/** Shared channel every API task publishes to and subscribes on. */
const BROADCAST_CHANNEL = 'safepass:ws:broadcast';

/** Envelope carried over the Redis relay — `kind` maps to which *Local
 * delivery function should run on the receiving task, `args` are that
 * function's parameters (positional, JSON-serializable only). */
interface CrossInstanceMessage {
  originInstanceId: string;
  kind: 'gpsUpdate' | 'tripStatus' | 'newMessage' | 'emergencyAlert' | 'toUser';
  args: unknown[];
}

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

/** Inbound WebSocket message envelope (sent by client). */
export interface WsClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'gps_update' | 'ping' | 'subscribe_all_trips';
  tripId?: string;
  payload?: unknown;
}

/** Outbound WebSocket message envelope (sent by server). */
export interface WsServerMessage {
  type:
    | 'gps_update'
    | 'trip_status'
    | 'new_message'
    | 'emergency_alert'
    | 'subscribed'
    | 'error'
    | 'pong'
    | 'all_trip_locations';
  tripId?: string;
  payload?: unknown;
  timestamp: string;
}

/** Connected client metadata stored in the connection registry. */
interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  role: string;
  subscribedTrips: Set<string>;
  connectedAt: number;
}

// ────────────────────────────────────────────────────────────
// In-Memory Connection Registry
// ────────────────────────────────────────────────────────────

/** Maps userId → client connection(s). Supports multiple devices per user. */
const connections = new Map<string, ConnectedClient[]>();

/** Maps tripId → set of userIds subscribed to updates for that trip. */
const tripSubscriptions = new Map<string, Set<string>>();

/** The WebSocket server instance, created once on startup. */
let wss: WebSocketServer | null = null;

// ────────────────────────────────────────────────────────────
// Initialization
// ────────────────────────────────────────────────────────────

/**
 * Attach the WebSocket server to an existing HTTP server.
 * Call this ONCE during server startup.
 *
 * Clients connect to ws://host/ws?token=<jwt_access_token>
 */
export function attachWebSocketServer(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/v1/ws' });

  // Cross-task relay: deliver every OTHER task's broadcast to this task's
  // own local connections. Skips messages this same process published
  // (INSTANCE_ID match) — those were already delivered locally by the
  // broadcast* export itself, before publishing. No-op (logged once) if
  // Redis isn't configured, in which case each task simply only ever
  // delivers to its own locally-connected clients, as before.
  const subscribed = subscribe(BROADCAST_CHANNEL, (raw: string) => {
    let msg: CrossInstanceMessage;
    try {
      msg = JSON.parse(raw) as CrossInstanceMessage;
    } catch {
      return;
    }
    if (msg.originInstanceId === INSTANCE_ID) return;

    switch (msg.kind) {
      case 'gpsUpdate':
        broadcastGpsUpdateLocal(
          msg.args[0] as string,
          msg.args[1] as Parameters<typeof broadcastGpsUpdateLocal>[1]
        );
        break;
      case 'tripStatus':
        broadcastTripStatusLocal(msg.args[0] as string, msg.args[1] as string);
        break;
      case 'newMessage':
        broadcastNewMessageLocal(
          msg.args[0] as string,
          msg.args[1] as Parameters<typeof broadcastNewMessageLocal>[1]
        );
        break;
      case 'emergencyAlert':
        broadcastEmergencyAlertLocal(msg.args[0] as string);
        break;
      case 'toUser':
        sendToUserLocal(msg.args[0] as string, msg.args[1] as WsServerMessage);
        break;
    }
  });
  console.log(
    subscribed
      ? '[WS] Cross-task broadcast relay enabled (Redis)'
      : '[WS] Cross-task broadcast relay DISABLED (UPSTASH_REDIS_URL not set) — ' +
        'clients on other ECS tasks will not receive this task\'s broadcasts'
  );

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    // Extract JWT from query string.
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.send(JSON.stringify(error('Missing auth token')));
      ws.close(4001, 'Unauthorized');
      return;
    }

    let user: JwtPayload;
    try {
      user = await verifyAccessToken(token);
    } catch {
      ws.send(JSON.stringify(error('Invalid or expired token')));
      ws.close(4001, 'Unauthorized');
      return;
    }

    const client: ConnectedClient = {
      ws,
      userId: user.sub,
      role: user.role,
      subscribedTrips: new Set(),
      connectedAt: Date.now(),
    };

    // Register client.
    const existing = connections.get(user.sub) ?? [];
    connections.set(user.sub, [...existing, client]);

    console.log(
      `[WS] Client connected: userId=${user.sub}, role=${user.role}, ` +
      `totalConnections=${getTotalConnections()}`
    );

    // Send welcome message.
    ws.send(JSON.stringify({
      type: 'subscribed',
      tripId: undefined,
      payload: { userId: user.sub, role: user.role },
      timestamp: new Date().toISOString(),
    } satisfies WsServerMessage));

    // Handle incoming messages.
    ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsClientMessage;
        handleClientMessage(client, msg);
      } catch {
        ws.send(JSON.stringify(error('Invalid message format')));
      }
    });

    // Cleanup on disconnect.
    ws.on('close', () => {
      // Unsubscribe from all trips.
      for (const tripId of client.subscribedTrips) {
        const subscribers = tripSubscriptions.get(tripId);
        if (subscribers) {
          subscribers.delete(user.sub);
          if (subscribers.size === 0) tripSubscriptions.delete(tripId);
        }
      }

      // Remove this specific connection from the user's connections.
      const userConns = connections.get(user.sub);
      if (userConns) {
        connections.set(
          user.sub,
          userConns.filter((c) => c !== client)
        );
        if (connections.get(user.sub)?.length === 0) {
          connections.delete(user.sub);
        }
      }

      console.log(
        `[WS] Client disconnected: userId=${user.sub}, ` +
        `remainingConnections=${getTotalConnections()}`
      );
    });

    // Handle errors gracefully.
    ws.on('error', (err: Error) => {
      console.error(`[WS] Error for userId=${user.sub}:`, err.message);
    });
  });

  console.log('[WS] WebSocket server attached to HTTP server');
  return wss;
}

// ────────────────────────────────────────────────────────────
// Inbound Message Handling
// ────────────────────────────────────────────────────────────

function handleClientMessage(client: ConnectedClient, msg: WsClientMessage): void {
  switch (msg.type) {
    case 'subscribe':
      if (msg.tripId) {
        client.subscribedTrips.add(msg.tripId);
        const subs = tripSubscriptions.get(msg.tripId) ?? new Set<string>();
        subs.add(client.userId);
        tripSubscriptions.set(msg.tripId, subs);

        client.ws.send(JSON.stringify({
          type: 'subscribed',
          tripId: msg.tripId,
          payload: { message: `Subscribed to trip ${msg.tripId}` },
          timestamp: new Date().toISOString(),
        } satisfies WsServerMessage));
      }
      break;

    case 'unsubscribe':
      if (msg.tripId) {
        client.subscribedTrips.delete(msg.tripId);
        const subs = tripSubscriptions.get(msg.tripId);
        if (subs) {
          subs.delete(client.userId);
          if (subs.size === 0) tripSubscriptions.delete(msg.tripId);
        }
      }
      break;

    case 'gps_update':
      if (msg.tripId && msg.payload) {
        broadcastToTrip(msg.tripId, {
          type: 'gps_update',
          tripId: msg.tripId,
          payload: msg.payload,
          timestamp: new Date().toISOString(),
        });
      }
      break;

    case 'ping':
      client.ws.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString(),
      } satisfies WsServerMessage));
      break;

    case 'subscribe_all_trips': {
      // Only privileged roles may request the global trip feed.
      if (!['admin', 'super_admin', 'monitoring_officer'].includes(client.role)) {
        client.ws.send(JSON.stringify(error('Not authorized')));
        break;
      }

      // Lazy-import trip.service to avoid a circular module dependency.
      // Fetch all currently in-progress trip IDs then batch-read their last
      // known GPS positions from DynamoDB and deliver as a single snapshot
      // message. Explicitly pass ACTIVE_STATUSES here — completed/cancelled
      // trips have no live GPS to broadcast, so unlike the admin trip-list
      // endpoint (which defaults to all non-draft statuses) this feed stays
      // scoped to in-progress trips only.
      import('./trip.service')
        .then(({ getActiveTrips, ACTIVE_STATUSES }) => getActiveTrips(ACTIVE_STATUSES))
        .then(async (activeTrips) => {
          const tripIds = activeTrips.map((t) => t.id);
          const locations = await getAllTripLocations(tripIds);

          const payload: Record<string, unknown> = {};
          for (const [tripId, loc] of locations) {
            payload[tripId] = loc;
          }

          client.ws.send(
            JSON.stringify({
              type: 'all_trip_locations',
              payload,
              timestamp: new Date().toISOString(),
            } satisfies WsServerMessage)
          );
        })
        .catch(() => { /* non-critical — client will fall back to REST */ });
      break;
    }

    default:
      client.ws.send(JSON.stringify(error(`Unknown message type: ${msg.type}`)));
  }
}

// ────────────────────────────────────────────────────────────
// Outbound Broadcasting (called by other services)
// ────────────────────────────────────────────────────────────

// Each pair below follows the same shape: `*Local` delivers ONLY to this
// task's own in-memory connections (the entire pre-Redis implementation,
// unchanged); the exported (non-Local) function is the one every other
// service in this codebase actually calls — it delivers locally exactly as
// before, AND publishes a CrossInstanceMessage so every other task's
// subscription (see attachWebSocketServer above) runs the same *Local
// delivery against ITS OWN local connections. Net effect: callers keep
// calling the same functions they always did, but delivery now reaches
// clients regardless of which ECS task they're connected to.

function broadcastGpsUpdateLocal(
  tripId: string,
  location: { latitude: number; longitude: number; speed?: number; heading?: number }
): void {
  const msg: WsServerMessage = {
    type: 'gps_update',
    tripId,
    payload: location,
    timestamp: new Date().toISOString(),
  };

  // Send to clients that explicitly subscribed to this trip
  // (mobile passengers, monitoring officers watching a specific trip).
  broadcastToTrip(tripId, msg);

  // Also push to all admin / super_admin / monitoring_officer connections
  // that did NOT already receive the message via the trip subscription,
  // so the live map updates without requiring per-trip subscriptions.
  const serialized = JSON.stringify(msg);
  for (const [, clients] of connections) {
    for (const client of clients) {
      if (
        ['admin', 'super_admin', 'monitoring_officer'].includes(client.role) &&
        !client.subscribedTrips.has(tripId)
      ) {
        try {
          client.ws.send(serialized);
        } catch {
          // Client may have disconnected.
        }
      }
    }
  }
}

export function broadcastGpsUpdate(
  tripId: string,
  location: { latitude: number; longitude: number; speed?: number; heading?: number }
): void {
  broadcastGpsUpdateLocal(tripId, location);
  void publish(BROADCAST_CHANNEL, {
    originInstanceId: INSTANCE_ID,
    kind: 'gpsUpdate',
    args: [tripId, location],
  } satisfies CrossInstanceMessage);
}

function broadcastTripStatusLocal(tripId: string, status: string): void {
  broadcastToTrip(tripId, {
    type: 'trip_status',
    tripId,
    payload: { status },
    timestamp: new Date().toISOString(),
  });
}

export function broadcastTripStatus(tripId: string, status: string): void {
  broadcastTripStatusLocal(tripId, status);
  void publish(BROADCAST_CHANNEL, {
    originInstanceId: INSTANCE_ID,
    kind: 'tripStatus',
    args: [tripId, status],
  } satisfies CrossInstanceMessage);
}

function broadcastNewMessageLocal(
  tripId: string,
  message: { id: string; senderId: string; senderRole: string; content: string; messageType?: string; createdAt: string }
): void {
  const msg: WsServerMessage = {
    type: 'new_message',
    tripId,
    payload: message,
    timestamp: new Date().toISOString(),
  };

  // Send to clients explicitly subscribed to this trip (e.g. an officer
  // watching a specific trip's detail page).
  broadcastToTrip(tripId, msg);

  // Also push to all admin / super_admin / monitoring_officer connections
  // that did NOT already receive the message via the trip subscription,
  // so the dashboard receives new_message events without requiring per-trip
  // subscriptions — matching the same pattern used by broadcastGpsUpdate.
  const serialized = JSON.stringify(msg);
  for (const [, clients] of connections) {
    for (const client of clients) {
      if (
        ['admin', 'super_admin', 'monitoring_officer'].includes(client.role) &&
        !client.subscribedTrips.has(tripId)
      ) {
        try {
          client.ws.send(serialized);
        } catch {
          // Client may have disconnected.
        }
      }
    }
  }
}

export function broadcastNewMessage(
  tripId: string,
  message: { id: string; senderId: string; senderRole: string; content: string; messageType?: string; createdAt: string }
): void {
  broadcastNewMessageLocal(tripId, message);
  void publish(BROADCAST_CHANNEL, {
    originInstanceId: INSTANCE_ID,
    kind: 'newMessage',
    args: [tripId, message],
  } satisfies CrossInstanceMessage);
}

function broadcastEmergencyAlertLocal(tripId: string): void {
  broadcastToTrip(tripId, {
    type: 'emergency_alert',
    tripId,
    payload: { message: 'Emergency triggered! Immediate attention required.' },
    timestamp: new Date().toISOString(),
  });

  for (const [, clients] of connections) {
    for (const client of clients) {
      if (
        ['admin', 'monitoring_officer', 'super_admin'].includes(client.role) &&
        !client.subscribedTrips.has(tripId)
      ) {
        try {
          client.ws.send(JSON.stringify({
            type: 'emergency_alert',
            tripId,
            payload: { message: 'Emergency triggered on another trip!' },
            timestamp: new Date().toISOString(),
          } satisfies WsServerMessage));
        } catch {
          // Client may have disconnected.
        }
      }
    }
  }
}

export function broadcastEmergencyAlert(tripId: string): void {
  broadcastEmergencyAlertLocal(tripId);
  void publish(BROADCAST_CHANNEL, {
    originInstanceId: INSTANCE_ID,
    kind: 'emergencyAlert',
    args: [tripId],
  } satisfies CrossInstanceMessage);
}

function sendToUserLocal(userId: string, message: WsServerMessage): void {
  const clients = connections.get(userId);
  if (!clients) return;

  for (const client of clients) {
    try {
      client.ws.send(JSON.stringify(message));
    } catch {
      // Client may have disconnected.
    }
  }
}

export function sendToUser(userId: string, message: WsServerMessage): void {
  sendToUserLocal(userId, message);
  void publish(BROADCAST_CHANNEL, {
    originInstanceId: INSTANCE_ID,
    kind: 'toUser',
    args: [userId, message],
  } satisfies CrossInstanceMessage);
}

// ────────────────────────────────────────────────────────────
// Internal Helpers
// ────────────────────────────────────────────────────────────

function broadcastToTrip(tripId: string, message: WsServerMessage): void {
  const subscribers = tripSubscriptions.get(tripId);
  if (!subscribers) return;

  const serialized = JSON.stringify(message);

  for (const userId of subscribers) {
    const userClients = connections.get(userId);
    if (!userClients) continue;

    for (const client of userClients) {
      try {
        client.ws.send(serialized);
      } catch {
        // Client may have disconnected.
      }
    }
  }
}

function error(message: string): WsServerMessage {
  return {
    type: 'error',
    payload: { message },
    timestamp: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────
// Observability
// ────────────────────────────────────────────────────────────

export function getTotalConnections(): number {
  let count = 0;
  for (const [, clients] of connections) {
    count += clients.length;
  }
  return count;
}

export function getActiveTripSubscriptions(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [tripId, subs] of tripSubscriptions) {
    counts.set(tripId, subs.size);
  }
  return counts;
}

export function getConnectionsByRole(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [, clients] of connections) {
    for (const client of clients) {
      counts[client.role] = (counts[client.role] ?? 0) + 1;
    }
  }
  return counts;
}
