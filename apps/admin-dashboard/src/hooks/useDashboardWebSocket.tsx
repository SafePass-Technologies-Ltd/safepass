'use client';

/**
 * useDashboardWebSocket — global WebSocket connection for the admin dashboard.
 *
 * Extends the GPS-only useTripWebSocket with:
 *   - `new_message` events: emitted when a traveller sends a message.
 *   - `onNewMessage` callback to drive the sticky notification popup.
 *
 * The hook keeps a single WebSocket connection alive for the lifetime of the
 * dashboard layout and auto-reconnects after disconnects.
 *
 * Context utilities exported alongside the hook so child pages can read
 * `livePositions` and `connected` from the layout's single connection instead
 * of opening a second WebSocket:
 *   - DashboardWsContext — React context holding { livePositions, connected }.
 *   - DashboardWsProvider — wrap the layout's children with this; pass
 *     `onNewMessage` as a prop to forward message events.
 *   - useDashboardWs — convenience hook that reads from DashboardWsContext.
 *
 * Usage (layout):
 *   <DashboardWsProvider onNewMessage={handleNewMessage}>{children}</DashboardWsProvider>
 *
 * Usage (page):
 *   const { livePositions, connected } = useDashboardWs();
 */

import { useEffect, useRef, useState, useCallback, createContext, useContext } from 'react';
import type { ReactNode } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000/v1/ws';

export interface LivePosition {
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  timestamp: string;
}

/** A new_message WS event payload received from the server. */
export interface IncomingMessage {
  id: string;
  tripId: string;
  senderId: string;
  senderRole: string;
  content: string;
  messageType?: string;
  createdAt: string;
  /** ISO timestamp of when this notification was received by the browser. */
  receivedAt: string;
}

export function useDashboardWebSocket(onNewMessage?: (msg: IncomingMessage) => void) {
  const [livePositions, setLivePositions] = useState<Map<string, LivePosition>>(
    new Map()
  );
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  // Tracks intentional closes (cleanup) so onclose doesn't schedule a phantom reconnect.
  const intentionalCloseRef = useRef(false);
  // Keep the callback in a ref so the stable `connect` closure always calls
  // the latest version without needing to be re-created.
  const onNewMessageRef = useRef(onNewMessage);
  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
  }, [onNewMessage]);

  const connect = useCallback(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (!token) return;

    intentionalCloseRef.current = false;
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: 'subscribe_all_trips' }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          tripId?: string;
          payload?: unknown;
          timestamp: string;
        };

        if (msg.type === 'gps_update' && msg.tripId && msg.payload) {
          const pos = msg.payload as LivePosition;
          setLivePositions((prev) => new Map(prev).set(msg.tripId!, pos));
        } else if (msg.type === 'all_trip_locations' && msg.payload) {
          const bulk = msg.payload as Record<string, LivePosition>;
          setLivePositions(new Map(Object.entries(bulk)));
        } else if (msg.type === 'new_message' && msg.payload) {
          const payload = msg.payload as {
            id: string;
            senderId: string;
            senderRole: string;
            content: string;
            messageType?: string;
            createdAt: string;
          };

          // Only surface messages from travellers — officers' own messages
          // don't need a popup since the officer sent them.
          if (payload.senderRole === 'user' && msg.tripId) {
            onNewMessageRef.current?.({
              ...payload,
              tripId: msg.tripId,
              receivedAt: new Date().toISOString(),
            });
          }
        }
      } catch {
        // Ignore parse errors.
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Only auto-reconnect for unexpected disconnects — not when React cleanup
      // intentionally closed the socket (e.g. StrictMode double-invoke, unmount).
      if (!intentionalCloseRef.current) {
        setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      intentionalCloseRef.current = true;
      wsRef.current?.close();
    };
  }, [connect]);

  return { livePositions, connected };
}

// ────────────────────────────────────────────────────────────
// Context — lets child pages share the layout's WS connection
// ────────────────────────────────────────────────────────────

interface DashboardWsContextValue {
  livePositions: Map<string, LivePosition>;
  connected: boolean;
}

/**
 * React context that carries the dashboard WebSocket state down the tree.
 * Default value is the disconnected / empty state so consumers that render
 * outside a provider degrade gracefully instead of throwing.
 */
export const DashboardWsContext = createContext<DashboardWsContextValue>({
  livePositions: new Map(),
  connected: false,
});

interface DashboardWsProviderProps {
  /** Called for every inbound `new_message` event where senderRole === 'user'. */
  onNewMessage?: (msg: IncomingMessage) => void;
  children: ReactNode;
}

/**
 * Wrap the dashboard layout's inner content with this provider.
 * It calls `useDashboardWebSocket` internally so the provider owns the single
 * WebSocket connection; all child pages read from context via `useDashboardWs`.
 */
export function DashboardWsProvider({ onNewMessage, children }: DashboardWsProviderProps) {
  const { livePositions, connected } = useDashboardWebSocket(onNewMessage);
  return (
    <DashboardWsContext.Provider value={{ livePositions, connected }}>
      {children}
    </DashboardWsContext.Provider>
  );
}

/**
 * Convenience hook for child pages to read `livePositions` and `connected`
 * from the layout's WebSocket connection without opening a second socket.
 *
 * Must be called inside a `<DashboardWsProvider>`.
 */
export function useDashboardWs(): DashboardWsContextValue {
  return useContext(DashboardWsContext);
}
