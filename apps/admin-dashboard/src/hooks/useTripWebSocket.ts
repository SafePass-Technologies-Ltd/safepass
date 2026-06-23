'use client';

/**
 * useTripWebSocket — connects to the SafePass WebSocket server and maintains
 * a live map of GPS positions for all active trips.
 *
 * On connection:
 *   1. Sends `subscribe_all_trips` to receive an `all_trip_locations` snapshot
 *      (current positions from DynamoDB for every active trip).
 *   2. Receives `gps_update` events in real-time as mobile clients push GPS.
 *
 * Reconnects automatically after a 3-second delay when the socket closes.
 *
 * Usage:
 *   const { livePositions, connected } = useTripWebSocket();
 *   // livePositions: Map<tripId, LivePosition>
 */
import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000/v1/ws';

export interface LivePosition {
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  /** ISO 8601 timestamp of the GPS reading from the device. */
  timestamp: string;
}

export function useTripWebSocket() {
  const [livePositions, setLivePositions] = useState<Map<string, LivePosition>>(
    new Map()
  );
  const [connected, setConnected] = useState(false);

  // Stable ref so the onclose handler always schedules the latest connect().
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    // Token is stored by the auth layer on login.
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (!token) return;

    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Request the initial GPS snapshot for all active trips.
      ws.send(JSON.stringify({ type: 'subscribe_all_trips' }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          tripId?: string;
          payload?: unknown;
        };

        if (msg.type === 'gps_update' && msg.tripId && msg.payload) {
          // Real-time update for a single trip — merge into the positions map.
          const pos = msg.payload as LivePosition;
          setLivePositions((prev) => new Map(prev).set(msg.tripId!, pos));
        } else if (msg.type === 'all_trip_locations' && msg.payload) {
          // Initial snapshot — replace the entire positions map.
          const bulk = msg.payload as Record<string, LivePosition>;
          setLivePositions(new Map(Object.entries(bulk)));
        }
      } catch {
        // Ignore parse errors — malformed messages should not crash the hook.
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Reconnect after a short back-off to handle transient disconnects.
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      // Close triggers the reconnect logic in onclose.
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      // Prevent the onclose handler from scheduling a reconnect after unmount.
      wsRef.current?.close();
    };
  }, [connect]);

  return { livePositions, connected };
}
