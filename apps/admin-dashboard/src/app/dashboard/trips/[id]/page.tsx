'use client';

import { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  RotateCcw,
  MapPin,
  Clock,
  User,
  Car,
  Send,
  PhoneCall,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Siren,
  Play,
  Loader2,
} from 'lucide-react';
import { apiClient, API_BASE_URL } from '@/lib/api-client';

// =============================================================================
// Types
// =============================================================================

type TripStatus = 'draft' | 'active' | 'delayed' | 'emergency' | 'escalated' | 'completed' | 'cancelled';

type SenderRole = 'user' | 'admin' | 'monitoring_officer' | 'system';
type MessageType = 'text' | 'check_in' | 'alert' | 'system';
type CheckInMethod = 'message' | 'call' | 'sms';
type CheckInResponse = 'pending' | 'confirmed_safe' | 'no_response' | 'concern_raised';
type EscalationStatus = 'pending' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';
type EmergencyEventStatus = 'active' | 'acknowledged' | 'escalated' | 'resolved_false_alarm' | 'resolved_incident';

interface StatusHistoryEntry {
  status: TripStatus;
  changedAt: string;
  note?: string;
}

interface TripDetail {
  id: string;
  userId: string;
  tripMode: 'driver' | 'passenger';
  origin: { name?: string; latitude: number; longitude: number };
  destination: { name?: string; latitude: number; longitude: number };
  status: TripStatus;
  startedAt: string | null;
  estimatedArrival: string | null;
  vehiclePlateNumber: string | null;
  transportCompany: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  statusHistory?: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  tripId: string;
  senderId: string;
  senderRole: SenderRole;
  content: string;
  messageType: MessageType;
  isRead: boolean;
  createdAt: string;
}

interface CheckIn {
  id: string;
  tripId: string;
  officerId: string;
  method: CheckInMethod;
  responseStatus: CheckInResponse;
  notes: string | null;
  createdAt: string;
}

interface Escalation {
  id: string;
  tripId: string;
  emergencyEventId: string | null;
  escalatedBy: string;
  escalatedTo: string | null;
  reason: string;
  notes: string | null;
  status: EscalationStatus;
  resolutionNotes: string | null;
  resolvedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface EmergencyEvent {
  id: string;
  tripId: string;
  triggerType: string;
  status: EmergencyEventStatus;
  latitude: number;
  longitude: number;
  speed: number | null;
  locationTimestamp: string;
  /** Local-disk relative URLs (e.g. "/uploads/emergency-audio/...") in dev,
   * or opaque S3 object keys in production -- see emergency.routes.ts's
   * upload endpoint. Distinguished at render time by the leading "/". */
  audioRecordingUrls: string[];
  emergencyContactNotified: boolean;
  resolutionNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

// =============================================================================
// Style constants
// =============================================================================

const STATUS_STYLE: Record<TripStatus, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Draft' },
  active: { bg: 'bg-green-100', text: 'text-green-700', label: 'Active' },
  delayed: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Delayed' },
  emergency: { bg: 'bg-red-100', text: 'text-red-700', label: 'Emergency' },
  escalated: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Escalated' },
  completed: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Completed' },
  cancelled: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Cancelled' },
};

const CHECKIN_METHOD_STYLE: Record<CheckInMethod, { bg: string; text: string; label: string }> = {
  message: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Message' },
  call: { bg: 'bg-green-100', text: 'text-green-700', label: 'Call' },
  sms: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'SMS' },
};

const CHECKIN_RESPONSE_STYLE: Record<CheckInResponse, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Pending' },
  confirmed_safe: { bg: 'bg-green-100', text: 'text-green-700', label: 'Confirmed Safe' },
  no_response: { bg: 'bg-red-100', text: 'text-red-700', label: 'No Response' },
  concern_raised: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Concern Raised' },
};

const EMERGENCY_STATUS_STYLE: Record<EmergencyEventStatus, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-red-100', text: 'text-red-700', label: 'Active' },
  acknowledged: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Acknowledged' },
  escalated: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Escalated' },
  resolved_false_alarm: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'False Alarm' },
  resolved_incident: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Resolved — Incident' },
};

const ESCALATION_STATUS_STYLE: Record<EscalationStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
  acknowledged: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Acknowledged' },
  in_progress: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'In Progress' },
  resolved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Resolved' },
  closed: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Closed' },
};

const SENDER_ROLE_STYLE: Record<SenderRole, { bg: string; text: string; label: string }> = {
  user: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'User' },
  admin: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Admin' },
  monitoring_officer: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Officer' },
  system: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'System' },
};

// =============================================================================
// Pill badge component
// =============================================================================

function Badge({ bg, text, label }: { bg: string; text: string; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${bg} ${text}`}
    >
      {label}
    </span>
  );
}

// =============================================================================
// Messages section
// =============================================================================

// ────────────────────────────────────────────────────────────
// Minimal WebSocket hook scoped to a single trip for the messages section.
// Connects once, subscribes to the trip, and calls onMessage on new_message events.
// ────────────────────────────────────────────────────────────

function useTripMessages(tripId: string, onMessage: (msg: Message) => void) {
  const onMessageRef = useRef(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

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
        };
        if (envelope.type === 'new_message' && envelope.tripId === tripId && envelope.payload) {
          const payload = envelope.payload as {
            id: string;
            senderId: string;
            senderRole: SenderRole;
            content: string;
            messageType?: MessageType;
            createdAt: string;
          };
          onMessageRef.current({
            id: payload.id,
            tripId,
            senderId: payload.senderId,
            senderRole: payload.senderRole,
            content: payload.content,
            messageType: payload.messageType ?? 'text',
            isRead: false,
            createdAt: payload.createdAt,
          });
        }
      } catch {
        // Ignore parse errors.
      }
    };

    ws.onerror = () => ws?.close();
    ws.onclose = () => { ws = null; };

    return () => {
      ws?.close();
    };
  }, [tripId]);
}

// =============================================================================
// Messages section
// =============================================================================

function MessagesSection({ tripId, tripEnded }: { tripId: string; tripEnded: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      // Use the trip-scoped endpoint which is available to both officers and users.
      const data = await apiClient<{ messages: Message[] }>(
        `/v1/trips/${tripId}/messages`
      );
      setMessages(data.messages ?? []);
      setError(null);
    } catch {
      setError('Failed to load messages.');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchMessages();
    // Mark user messages as read now that an officer has opened this trip.
    apiClient(`/v1/trips/${tripId}/messages/read`, { method: 'POST' }).catch(() => {});
  }, [fetchMessages, tripId]);

  // Append incoming WebSocket messages without a full refetch.
  const handleIncomingMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      // Deduplicate: if we somehow already have this id (e.g. optimistic update), skip.
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  useTripMessages(tripId, handleIncomingMessage);

  // Scroll to bottom whenever new messages arrive.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    if (!text) return;

    setSending(true);
    try {
      // POST /v1/trips/:tripId/messages — trip-scoped endpoint, handles role detection.
      const msg = await apiClient<Message>(`/v1/trips/${tripId}/messages`, {
        method: 'POST',
        body: { content: text, messageType: 'text' },
      });
      setMessages((prev) => [...prev, msg]);
      setContent('');
    } catch {
      setError('Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-700">Messages</h2>
      </div>

      {/* Chat thread */}
      <div className="h-72 overflow-y-auto px-6 py-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        {!loading && error && (
          <p className="text-center text-sm text-red-500">{error}</p>
        )}
        {!loading && !error && messages.length === 0 && (
          <p className="text-center text-sm text-slate-400">No messages yet.</p>
        )}
        {messages.map((msg) => {
          const isOfficer = msg.senderRole === 'monitoring_officer' || msg.senderRole === 'admin';
          const roleStyle = SENDER_ROLE_STYLE[msg.senderRole] ?? SENDER_ROLE_STYLE.system;
          return (
            <div
              key={msg.id}
              className={`flex flex-col gap-1 ${isOfficer ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-2">
                <Badge {...roleStyle} />
                <span className="text-xs text-slate-400">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div
                className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${
                  isOfficer
                    ? 'bg-primary text-white rounded-tr-none'
                    : 'bg-slate-100 text-slate-700 rounded-tl-none'
                }`}
              >
                {msg.content}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input — disabled once the trip has ended; the backend rejects
          sends against a cancelled/completed trip anyway (see
          message.service.ts's sendMessage status guard). */}
      {tripEnded ? (
        <p className="border-t border-slate-100 px-6 py-3 text-center text-xs text-slate-400">
          This trip has ended — messaging is no longer available.
        </p>
      ) : (
        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 border-t border-slate-100 px-4 py-3"
        >
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !content.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
      )}
    </div>
  );
}

// =============================================================================
// Check-Ins section
// =============================================================================

function CheckInsSection({ tripId, tripEnded }: { tripId: string; tripEnded: boolean }) {
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [method, setMethod] = useState<CheckInMethod>('message');
  const [responseStatus, setResponseStatus] = useState<CheckInResponse>('pending');
  const [notes, setNotes] = useState('');

  const fetchCheckIns = useCallback(async () => {
    try {
      const data = await apiClient<{ checkins: CheckIn[] }>(
        `/v1/admin/checkins?tripId=${tripId}`
      );
      setCheckIns(data.checkins ?? []);
      setError(null);
    } catch {
      setError('Failed to load check-ins.');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchCheckIns();
  }, [fetchCheckIns]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const checkin = await apiClient<CheckIn>('/v1/admin/checkins', {
        method: 'POST',
        body: { tripId, method, responseStatus, notes: notes || undefined },
      });
      setCheckIns((prev) => [checkin, ...prev]);
      setShowForm(false);
      setNotes('');
      setMethod('message');
      setResponseStatus('pending');
    } catch {
      setFormError('Failed to log check-in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Check-Ins</h2>
          {tripEnded && (
            <span className="text-xs text-slate-400">This trip has ended</span>
          )}
        </div>
        {/* Disabled once the trip has ended — the backend rejects new
            check-ins against a cancelled/completed trip (see
            admin-emergency.routes.ts's checkinRoutes.post guard). */}
        {!tripEnded && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <PhoneCall className="h-3.5 w-3.5" />
            Log Check-In
            {showForm ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Inline form */}
      {showForm && !tripEnded && (
        <form onSubmit={handleSubmit} className="border-b border-slate-100 bg-slate-50 px-6 py-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as CheckInMethod)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="message">Message</option>
                <option value="call">Call</option>
                <option value="sms">SMS</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Response Status</label>
              <select
                value={responseStatus}
                onChange={(e) => setResponseStatus(e.target.value as CheckInResponse)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="pending">Pending</option>
                <option value="confirmed_safe">Confirmed Safe</option>
                <option value="no_response">No Response</option>
                <option value="concern_raised">Concern Raised</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Add any relevant notes…"
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {submitting ? 'Submitting…' : 'Submit Check-In'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError(null); }}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Check-in list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : error ? (
        <p className="px-6 py-4 text-sm text-red-500">{error}</p>
      ) : checkIns.length === 0 ? (
        <p className="px-6 py-6 text-center text-sm text-slate-400">No check-ins logged yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {checkIns.map((ci) => {
            const methodStyle = CHECKIN_METHOD_STYLE[ci.method];
            const responseStyle = CHECKIN_RESPONSE_STYLE[ci.responseStatus];
            return (
              <li key={ci.id} className="px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge {...methodStyle} />
                    <Badge {...responseStyle} />
                    {ci.notes && (
                      <span className="text-sm text-slate-500">{ci.notes}</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(ci.createdAt).toLocaleString()}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// =============================================================================
// Emergency Events section (panic-button audio evidence playback)
// =============================================================================

/**
 * A single audio recording row. Local-disk keys (dev fallback, always
 * start with "/") are served directly as static file URLs off the API's
 * own origin. Production S3 object keys are opaque (no leading "/") and
 * require exchanging them for a short-lived presigned GET URL first — the
 * bucket blocks all public access, so a raw key is never directly playable
 * (see s3.service.ts's getEvidencePlaybackUrl and the admin-only
 * GET /v1/admin/emergencies/:id/audio/url endpoint).
 */
function AudioRecordingRow({ eventId, recordingKey, index }: { eventId: string; recordingKey: string; index: number }) {
  const isLocalDisk = recordingKey.startsWith('/');
  const [signedUrl, setSignedUrl] = useState<string | null>(isLocalDisk ? `${API_BASE_URL}${recordingKey}` : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(isLocalDisk);

  const handlePlay = async () => {
    if (signedUrl) { setRevealed(true); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<{ url: string }>(
        `/v1/admin/emergencies/${eventId}/audio/url?key=${encodeURIComponent(recordingKey)}`
      );
      setSignedUrl(data.url);
      setRevealed(true);
    } catch {
      // Presigned URLs expire after 10 minutes -- a stale/reused link is the
      // most likely cause if this ever fires after a long-open tab.
      setError('Failed to load recording. It may have expired — try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-slate-500">Recording {index + 1}</span>
        {!revealed && (
          <button
            onClick={handlePlay}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {loading ? 'Loading…' : 'Play'}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {revealed && signedUrl && (
        <audio controls preload="none" className="mt-2 h-9 w-full">
          <source src={signedUrl} />
          Your browser does not support audio playback.
        </audio>
      )}
    </div>
  );
}

function EmergencyEventsSection({ tripId }: { tripId: string }) {
  const [events, setEvents] = useState<EmergencyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const data = await apiClient<{ emergencies: EmergencyEvent[] }>(
        `/v1/admin/emergencies?tripId=${tripId}`
      );
      setEvents(data.emergencies ?? []);
      setError(null);
    } catch {
      setError('Failed to load emergency events.');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Nothing to show for trips that never had a panic-button trigger --
  // avoid an empty card cluttering the (common) non-emergency trip detail
  // view. Escalations/check-ins sections above always render since officers
  // may want to log one even without a prior emergency event.
  if (!loading && !error && events.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
        <Siren className="h-4 w-4 text-red-500" />
        <h2 className="text-sm font-semibold text-slate-700">Emergency Events</h2>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : error ? (
        <p className="px-6 py-4 text-sm text-red-500">{error}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {events.map((event) => {
            const statusStyle = EMERGENCY_STATUS_STYLE[event.status];
            return (
              <li key={event.id} className="space-y-3 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge {...statusStyle} />
                    <span className="text-xs capitalize text-slate-500">
                      {event.triggerType.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {event.latitude.toFixed(5)}, {event.longitude.toFixed(5)}
                  {event.speed != null && <span> · {event.speed.toFixed(0)} km/h</span>}
                </div>

                {event.resolutionNotes && (
                  <p className="text-xs text-slate-500">Resolution: {event.resolutionNotes}</p>
                )}

                {/* Audio evidence -- the whole point of this section. Every
                    recording uploaded during this emergency session (panic
                    press to check-in) shows up here for playback. */}
                {event.audioRecordingUrls.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                      Audio Evidence ({event.audioRecordingUrls.length})
                    </p>
                    {event.audioRecordingUrls.map((key, i) => (
                      <AudioRecordingRow key={key} eventId={event.id} recordingKey={key} index={i} />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// =============================================================================
// Escalations section
// =============================================================================

function EscalationsSection({ tripId, tripEnded }: { tripId: string; tripEnded: boolean }) {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const fetchEscalations = useCallback(async () => {
    try {
      const data = await apiClient<{ escalations: Escalation[] }>(
        `/v1/admin/escalations?tripId=${tripId}`
      );
      setEscalations(data.escalations ?? []);
      setError(null);
    } catch {
      setError('Failed to load escalations.');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchEscalations();
  }, [fetchEscalations]);

  // Determine if there is an active (non-terminal) escalation.
  const activeEscalation = escalations.find(
    (e) => e.status !== 'resolved' && e.status !== 'closed'
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) { setFormError('Reason is required.'); return; }
    setSubmitting(true);
    setFormError(null);
    try {
      const escalation = await apiClient<Escalation>('/v1/admin/escalations', {
        method: 'POST',
        body: { tripId, reason: reason.trim(), notes: notes || undefined },
      });
      setEscalations((prev) => [escalation, ...prev]);
      setShowForm(false);
      setReason('');
      setNotes('');
    } catch {
      setFormError('Failed to create escalation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Escalations</h2>
          {/* Show current active escalation status prominently */}
          {activeEscalation && (
            <Badge {...ESCALATION_STATUS_STYLE[activeEscalation.status]} />
          )}
          {tripEnded && (
            <span className="text-xs text-slate-400">This trip has ended</span>
          )}
        </div>
        {/* Only allow a new escalation if there is no active one, and the
            trip is still in progress — the backend rejects escalating a
            cancelled/completed trip (see admin-emergency.routes.ts's
            escalationRoutes.post guard). */}
        {!activeEscalation && !tripEnded && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Escalate
            {showForm ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Inline escalation form */}
      {showForm && !activeEscalation && !tripEnded && (
        <form onSubmit={handleSubmit} className="border-b border-slate-100 bg-red-50/40 px-6 py-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
              placeholder="Describe the reason for escalation…"
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-300"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional context…"
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-300"
            />
          </div>
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <AlertTriangle className="h-4 w-4" />
              {submitting ? 'Escalating…' : 'Confirm Escalation'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError(null); }}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Escalation audit trail */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : error ? (
        <p className="px-6 py-4 text-sm text-red-500">{error}</p>
      ) : escalations.length === 0 ? (
        <p className="px-6 py-6 text-center text-sm text-slate-400">No escalations on record.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {escalations.map((esc) => {
            const statusStyle = ESCALATION_STATUS_STYLE[esc.status];
            return (
              <li key={esc.id} className="px-6 py-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge {...statusStyle} />
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(esc.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-slate-700">{esc.reason}</p>
                {esc.notes && (
                  <p className="text-xs text-slate-500">Note: {esc.notes}</p>
                )}
                {esc.resolutionNotes && (
                  <p className="text-xs text-slate-500">Resolution: {esc.resolutionNotes}</p>
                )}
                {esc.resolvedAt && (
                  <p className="text-xs text-slate-400">
                    Resolved {new Date(esc.resolvedAt).toLocaleString()}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// =============================================================================
// Main Trip Detail Page
// =============================================================================

export default function TripDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrip = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const trip = await apiClient<TripDetail>(`/v1/admin/trips/${id}`);
      setTrip(trip);
    } catch (err) {
      setError('Failed to load trip details.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/trips"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Trips
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error ?? 'Trip not found.'}
        </div>
      </div>
    );
  }

  const statusStyle = STATUS_STYLE[trip.status];
  const originName = trip.origin?.name ?? `${trip.origin.latitude.toFixed(4)}, ${trip.origin.longitude.toFixed(4)}`;
  const destName = trip.destination?.name ?? `${trip.destination.latitude.toFixed(4)}, ${trip.destination.longitude.toFixed(4)}`;
  // Messaging, check-ins, and escalation only make sense while the trip is
  // still being monitored — mirrors the backend guards in message.service.ts
  // and admin-emergency.routes.ts.
  const tripEnded = trip.status === 'completed' || trip.status === 'cancelled';

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div>
        <Link
          href="/dashboard/trips"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Trips
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-dark">Trip Detail</h1>
            <p className="mt-0.5 text-xs text-slate-400 font-mono">{trip.id}</p>
          </div>
          <button
            onClick={fetchTrip}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Main details card */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-700">Trip Information</h2>
        </div>
        <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {/* Left column */}
          <div className="space-y-4 p-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Route</p>
              <div className="mt-1 flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-700">{originName}</p>
                  <p className="text-sm text-slate-500">→ {destName}</p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Status</p>
              <div className="mt-1">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                  {statusStyle.label}
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Mode</p>
              <p className="mt-1 text-sm capitalize text-slate-700">{trip.tripMode}</p>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4 p-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Vehicle / Company</p>
              <div className="mt-1 flex items-center gap-2">
                <Car className="h-4 w-4 text-slate-400" />
                <p className="text-sm text-slate-700">
                  {trip.vehiclePlateNumber ?? trip.transportCompany ?? '—'}
                </p>
              </div>
            </div>
            {(trip.driverName || trip.driverPhone) && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Driver</p>
                <div className="mt-1 flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" />
                  <div>
                    {trip.driverName && <p className="text-sm text-slate-700">{trip.driverName}</p>}
                    {trip.driverPhone && <p className="text-xs text-slate-500">{trip.driverPhone}</p>}
                  </div>
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Started At</p>
              <div className="mt-1 flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <p className="text-sm text-slate-700">
                  {trip.startedAt ? new Date(trip.startedAt).toLocaleString() : '—'}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Created At</p>
              <p className="mt-1 text-sm text-slate-700">{new Date(trip.createdAt).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status history */}
      {trip.statusHistory && trip.statusHistory.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-700">Status History</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {trip.statusHistory.map((entry, i) => {
              const s = STATUS_STYLE[entry.status];
              return (
                <li key={i} className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
                      {s.label}
                    </span>
                    {entry.note && <p className="text-sm text-slate-500">{entry.note}</p>}
                  </div>
                  <p className="text-xs text-slate-400">{new Date(entry.changedAt).toLocaleString()}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── New sections ─────────────────────────────────────── */}

      <EmergencyEventsSection tripId={trip.id} />

      <MessagesSection tripId={trip.id} tripEnded={tripEnded} />

      <CheckInsSection tripId={trip.id} tripEnded={tripEnded} />

      <EscalationsSection tripId={trip.id} tripEnded={tripEnded} />
    </div>
  );
}
