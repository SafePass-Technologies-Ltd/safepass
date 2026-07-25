'use client';

/**
 * useTripLiveLocation — real-time current/last-known position for a single
 * trip, for the Trip Detail route map (as opposed to useTripWebSocket,
 * which maintains positions for *every* active trip for the fleet-wide
 * live map).
 *
 * Mirrors the trip-detail page's existing per-trip WebSocket pattern (see
 * useTripMessages in [id]/page.tsx): connects once, sends
 * `{ type: 'subscribe', tripId }`, and listens for `gps_update` events
 * scoped to this trip. Seeded with `initialLocation` (the currentLocation
 * already resolved server-side by GET /v1/admin/trips/:tripId's fallback
 * chain -- DynamoDB live position -> trip_location_history breadcrumb) so
 * the marker has a correct position on first paint, before any WebSocket
 * event arrives -- which, for a completed/cancelled trip, may be never,
 * since the mobile app stops sending GPS once a trip ends.
 */
import { useEffect, useRef, useState } from 'react';

export interface TripLocation {
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  /** May be absent on WS-delivered updates (see below) -- display code
   * should treat a missing timestamp as "just now" rather than erroring. */
  timestamp?: string;
}

export function useTripLiveLocation(
  tripId: string,
  initialLocation: TripLocation | null
) {
  const [location, setLocation] = useState<TripLocation | null>(initialLocation);

  // Only seed from the prop on first mount / tripId change -- once the
  // WebSocket starts delivering updates, a stale re-render of the initial
  // fetch result should not clobber a newer live position.
  const seededTripId = useRef<string | null>(null);
  useEffect(() => {
    if (seededTripId.current !== tripId) {
      seededTripId.current = tripId;
      setLocation(initialLocation);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(() => {
    const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000/v1/ws';
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (!token) return;

    let ws: WebSocket | null = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);

    ws.onopen = () => {
      ws?.send(JSON.stringify({ type: 'subscribe', tripId }));
    };

    ws.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data as string) as {
          type: string;
          tripId?: string;
          payload?: unknown;
          timestamp?: string;
        };
        if (envelope.type === 'gps_update' && envelope.tripId === tripId && envelope.payload) {
          // The server's gps_update payload is { latitude, longitude, speed?,
          // heading? } -- no timestamp inside payload itself (see
          // websocket.service.ts's broadcastGpsUpdateLocal), so fall back to
          // the envelope-level timestamp it's broadcast with.
          const payload = envelope.payload as Omit<TripLocation, 'timestamp'>;
          setLocation({ ...payload, timestamp: envelope.timestamp });
        }
      } catch {
        // Ignore parse errors -- a malformed WS frame should not crash the map.
      }
    };

    ws.onerror = () => ws?.close();
    ws.onclose = () => { ws = null; };

    return () => {
      ws?.close();
    };
  }, [tripId]);

  return location;
}
