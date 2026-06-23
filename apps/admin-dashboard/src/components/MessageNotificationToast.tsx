'use client';

/**
 * MessageNotificationToast — global sticky notification popup for incoming
 * traveller messages.
 *
 * Renders a stacked column of toast cards in the bottom-right corner of the
 * viewport. Each card:
 *   - Shows the tripId excerpt, message preview, and arrival time.
 *   - Navigates to /dashboard/trips/[tripId] when the body is clicked.
 *   - Has an X button to dismiss it immediately.
 *   - Auto-dismisses after 15 seconds.
 *
 * Mount this component inside the dashboard layout so it is present on every
 * page. Pass the `onNewMessage` callback from useDashboardWebSocket into it.
 *
 * Usage (from layout):
 *   <MessageNotificationToast />
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, MessageCircle } from 'lucide-react';
import type { IncomingMessage } from '@/hooks/useDashboardWebSocket';

const AUTO_DISMISS_MS = 15_000;

interface ToastEntry extends IncomingMessage {
  /** Local unique key for React reconciliation. */
  key: string;
}

interface Props {
  /** Called by the parent with each new traveller message from the WebSocket. */
  onMount?: (handler: (msg: IncomingMessage) => void) => void;
}

/**
 * Each toast represents the latest message for a given trip. When a second
 * message arrives from the same trip before the toast is dismissed, the
 * existing card is updated in place (same tripId → same slot in the stack).
 */
export function MessageNotificationToast() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const router = useRouter();

  /** Dismiss a single toast and clear its auto-dismiss timer. */
  const dismiss = useCallback((tripId: string) => {
    setToasts((prev) => prev.filter((t) => t.tripId !== tripId));
    const timer = timerRefs.current.get(tripId);
    if (timer !== undefined) {
      clearTimeout(timer);
      timerRefs.current.delete(tripId);
    }
  }, []);

  /** Schedule auto-dismiss for a toast, replacing any existing schedule. */
  const scheduleAutoDismiss = useCallback(
    (tripId: string) => {
      // Cancel the previous timer for this trip if it exists.
      const existing = timerRefs.current.get(tripId);
      if (existing !== undefined) clearTimeout(existing);

      const timer = setTimeout(() => {
        dismiss(tripId);
      }, AUTO_DISMISS_MS);

      timerRefs.current.set(tripId, timer);
    },
    [dismiss]
  );

  /**
   * Public handler — called by the layout's WebSocket hook when a new
   * traveller message arrives.
   *
   * If a toast for this trip already exists, update its content in place
   * (so the stack depth stays bounded). Otherwise prepend a new card.
   */
  const handleNewMessage = useCallback(
    (msg: IncomingMessage) => {
      setToasts((prev) => {
        const exists = prev.findIndex((t) => t.tripId === msg.tripId);
        if (exists >= 0) {
          // Update the existing card with the latest message content.
          const next = [...prev];
          next[exists] = { ...msg, key: prev[exists]!.key };
          return next;
        }
        // Prepend so newest is at the top of the stack.
        return [{ ...msg, key: `${msg.tripId}-${msg.receivedAt}` }, ...prev];
      });

      // Reset the 15-second auto-dismiss timer for this trip.
      scheduleAutoDismiss(msg.tripId);
    },
    [scheduleAutoDismiss]
  );

  // Expose the handler via a stable ref so useDashboardWebSocket can call it.
  // We store it on the window so the dashboard layout can reach it.
  useEffect(() => {
    (window as Window & { __spMessageHandler?: typeof handleNewMessage }).__spMessageHandler =
      handleNewMessage;
    return () => {
      delete (window as Window & { __spMessageHandler?: typeof handleNewMessage }).__spMessageHandler;
    };
  }, [handleNewMessage]);

  // Cleanup all timers on unmount.
  useEffect(() => {
    const timers = timerRefs.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="New message notifications"
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-80"
    >
      {toasts.map((toast) => (
        <ToastCard
          key={toast.key}
          toast={toast}
          onDismiss={() => dismiss(toast.tripId)}
          onClick={() => {
            dismiss(toast.tripId);
            router.push(`/dashboard/trips/${toast.tripId}`);
          }}
        />
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Toast Card
// ────────────────────────────────────────────────────────────

interface ToastCardProps {
  toast: ToastEntry;
  onDismiss: () => void;
  onClick: () => void;
}

function ToastCard({ toast, onDismiss, onClick }: ToastCardProps) {
  const timeLabel = formatTime(toast.receivedAt);
  // Show a short excerpt of the trip ID so officers know which trip.
  const tripShort = toast.tripId.slice(0, 8).toUpperCase();

  return (
    <div
      role="alert"
      className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/80 transition-all"
    >
      {/* Progress bar draining over 15s for visual auto-dismiss indication */}
      <div className="absolute top-0 left-0 h-1 bg-primary animate-[shrink_15s_linear_forwards]" />

      {/* Clickable body — navigates to trip detail */}
      <button
        onClick={onClick}
        className="flex w-full items-start gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
        aria-label={`Open trip ${tripShort} — ${toast.content}`}
      >
        {/* Icon */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <MessageCircle className="h-4 w-4 text-primary" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-primary">Trip #{tripShort}</p>
            <span className="text-xs text-slate-400 shrink-0">{timeLabel}</span>
          </div>
          <p className="mt-0.5 text-sm text-slate-700 line-clamp-2">
            {toast.content}
          </p>
          <p className="mt-1 text-xs text-slate-400">Tap to open conversation</p>
        </div>
      </button>

      {/* Dismiss button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        aria-label="Dismiss notification"
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    const dt = new Date(iso);
    return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
