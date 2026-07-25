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
  Phone,
  Mail,
  Users,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Siren,
  Play,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { apiClient, API_BASE_URL } from '@/lib/api-client';
import TripRouteMap from '@/components/map/trip-route-map';
import type { TripLocation } from '@/hooks/useTripLiveLocation';

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

interface EmergencyContact {
  name: string;
  relationship?: string;
  phone: string;
  phoneWhatsappEnabled?: boolean;
  email?: string;
}

interface TripUser {
  fullName: string;
  phone: string | null;
  email: string | null;
  emergencyContacts: EmergencyContact[];
}

interface TripDetail {
  id: string;
  userId: string;
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
  /** Fixed, one-time-computed route (see directions.service.ts) -- null if
   * Directions was unavailable at trip creation, or this trip predates the
   * feature. The route map falls back to a straight line in that case. */
  routePolyline?: string | null;
  /** Resolved server-side by GET /v1/admin/trips/:tripId: DynamoDB live
   * position -> trip_location_history breadcrumb fallback -> null. Seeds
   * the route map's live position marker. */
  currentLocation?: TripLocation | null;
  /** The traveller's account info (screens.md A-04 "User info"/"Emergency
   * Contacts"). Null if the lookup failed or the user's account has since
   * been anonymized (M-38 Account Deletion). */
  user?: TripUser | null;
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

function CheckInsSection({
  tripId,
  tripEnded,
  refreshSignal,
}: {
  tripId: string;
  tripEnded: boolean;
  refreshSignal?: number;
}) {
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

  const isFirstRefresh = useRef(true);
  useEffect(() => {
    if (isFirstRefresh.current) {
      isFirstRefresh.current = false;
      return;
    }
    fetchCheckIns();
  }, [refreshSignal, fetchCheckIns]);

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

/** Emergency event statuses that are already terminal -- no Resolve action
 * shown for these (matches EmergencyEventStatus's two "resolved_*" values). */
function isTerminalEmergencyStatus(status: EmergencyEventStatus): boolean {
  return status === 'resolved_false_alarm' || status === 'resolved_incident';
}

function EmergencyEventsSection({
  tripId,
  refreshSignal,
}: {
  tripId: string;
  /** Bumped by the page-level WebSocket subscription / polling fallback --
   * triggers a background refetch so a new panic trigger, resolution, or
   * audio chunk from elsewhere shows up without a manual page refresh. */
  refreshSignal?: number;
}) {
  const [events, setEvents] = useState<EmergencyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resolve form state -- keyed by event id so multiple events (rare, but
  // possible if a trip had more than one panic trigger) don't share state.
  const [resolvingEventId, setResolvingEventId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [submittingStatus, setSubmittingStatus] = useState<EmergencyEventStatus | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

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

  // Refetch on every real-time signal (new WS event or the page-level
  // polling fallback) -- reuses fetchEvents as-is, so this briefly shows
  // the loading spinner just like the existing manual-refresh path does.
  const isFirstRefresh = useRef(true);
  useEffect(() => {
    if (isFirstRefresh.current) {
      isFirstRefresh.current = false;
      return;
    }
    fetchEvents();
  }, [refreshSignal, fetchEvents]);

  // Resolving an emergency (PATCH /v1/admin/emergencies/:id) is what
  // actually tells the traveller's phone to stop recording -- it broadcasts
  // a WebSocket `emergency_resolved` event the mobile app listens for (see
  // emergency_cubit.dart). This was previously unreachable from the UI
  // entirely: the endpoint and broadcast existed server-side, but nothing
  // in the dashboard called it. Note this is a DIFFERENT action from
  // logging a Check-In below -- a check-in (even "Confirmed Safe") is a
  // separate contact-attempt log and never touches the emergency event or
  // notifies the phone.
  const handleResolve = async (eventId: string, status: EmergencyEventStatus) => {
    setSubmittingStatus(status);
    setResolveError(null);
    try {
      await apiClient(`/v1/admin/emergencies/${eventId}`, {
        method: 'PATCH',
        body: { status, resolutionNotes: resolutionNotes.trim() || undefined },
      });
      setResolvingEventId(null);
      setResolutionNotes('');
      await fetchEvents();
    } catch {
      setResolveError('Failed to resolve emergency. Please try again.');
    } finally {
      setSubmittingStatus(null);
    }
  };

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
          {events.map((event, i) => {
            const statusStyle = EMERGENCY_STATUS_STYLE[event.status];
            const isTerminal = isTerminalEmergencyStatus(event.status);
            const isResolving = resolvingEventId === event.id;
            // events is ordered newest-first (API: desc(createdAt)) -- flip
            // the index so "Attempt 1" is chronologically first, matching
            // how an officer would talk about it ("this was the second
            // time they triggered panic on this trip"), not API order.
            const attemptNumber = events.length - i;
            return (
              <li key={event.id} className="space-y-3 px-6 py-4">
                {/* Attempt numbering + prominent timestamp -- multiple
                    emergency events on the same trip (re-triggered panic)
                    render as separate cards here, which was previously easy
                    to misread as one confusing/contradictory state (e.g. a
                    "no audio" card sitting next to a "6 recordings" card)
                    rather than two distinct events at different times. */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Attempt {attemptNumber} of {events.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge {...statusStyle} />
                  <span className="text-xs capitalize text-slate-500">
                    {event.triggerType.replace(/_/g, ' ')}
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

                {event.resolvedAt && (
                  <p className="text-xs text-slate-400">
                    Resolved {new Date(event.resolvedAt).toLocaleString()}
                  </p>
                )}

                {/* Audio evidence -- the whole point of this section. Every
                    recording uploaded during this emergency session shows
                    up here for playback, in ~30s chunks uploaded
                    progressively as the emergency happens (not just at the
                    end) -- see emergency_cubit.dart. */}
                {event.audioRecordingUrls.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                      Audio Evidence ({event.audioRecordingUrls.length})
                    </p>
                    {event.audioRecordingUrls.map((key, i) => (
                      <AudioRecordingRow key={key} eventId={event.id} recordingKey={key} index={i} />
                    ))}
                  </div>
                ) : (
                  // Previously this rendered nothing at all for a
                  // zero-recordings event, indistinguishable from "still
                  // loading" or "feature not working." Explicit here since
                  // the most common real cause is a denied/never-granted
                  // microphone permission on the traveller's device (see
                  // AudioRecordingService.lastStartFailed) -- chunks upload
                  // roughly every 30s while active, so a non-terminal event
                  // older than that with nothing yet is worth flagging.
                  <p className="text-xs text-slate-400">
                    {isTerminal
                      ? 'No audio was recorded during this emergency (traveller’s device may have denied microphone permission, or the session ended before the first ~30s chunk).'
                      : 'No audio chunks received yet — uploads roughly every 30s while active. If none arrive, the traveller’s device may have denied microphone permission.'}
                  </p>
                )}

                {/* Resolve action -- only for a non-terminal event. */}
                {!isTerminal && (
                  <div className="pt-1">
                    {!isResolving ? (
                      <button
                        onClick={() => { setResolvingEventId(event.id); setResolutionNotes(''); setResolveError(null); }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Resolve
                      </button>
                    ) : (
                      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <label className="block text-xs font-medium text-slate-600">
                          Resolution notes (optional)
                        </label>
                        <textarea
                          value={resolutionNotes}
                          onChange={(e) => setResolutionNotes(e.target.value)}
                          rows={2}
                          placeholder="What happened? Any relevant context…"
                          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        />
                        {resolveError && <p className="text-xs text-red-500">{resolveError}</p>}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleResolve(event.id, 'resolved_false_alarm')}
                            disabled={submittingStatus !== null}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40"
                          >
                            {submittingStatus === 'resolved_false_alarm' ? 'Marking…' : 'Mark False Alarm'}
                          </button>
                          <button
                            onClick={() => handleResolve(event.id, 'resolved_incident')}
                            disabled={submittingStatus !== null}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                          >
                            {submittingStatus === 'resolved_incident' ? 'Marking…' : 'Mark Resolved — Incident'}
                          </button>
                          <button
                            onClick={() => { setResolvingEventId(null); setResolveError(null); }}
                            disabled={submittingStatus !== null}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
                          >
                            Cancel
                          </button>
                        </div>
                        <p className="text-xs text-slate-400">
                          Resolving notifies the traveller&apos;s phone in real time and stops the
                          background audio recording.
                        </p>
                      </div>
                    )}
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

function EscalationsSection({
  tripId,
  tripEnded,
  refreshSignal,
}: {
  tripId: string;
  tripEnded: boolean;
  refreshSignal?: number;
}) {
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

  // No server-side broadcast exists yet for escalation create/update, so
  // this section relies entirely on the page-level 60s polling fallback
  // (not WS) to pick up changes made elsewhere -- still real-time-ish, just
  // coarser than the WS-driven sections above.
  const isFirstRefresh = useRef(true);
  useEffect(() => {
    if (isFirstRefresh.current) {
      isFirstRefresh.current = false;
      return;
    }
    fetchEscalations();
  }, [refreshSignal, fetchEscalations]);

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
// Traveller section (screens.md A-04 "User info" / "Emergency Contacts")
// =============================================================================

function TravellerSection({ user }: { user: TripUser | null | undefined }) {
  if (!user) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-700">Traveller</h2>
        </div>
        <p className="px-6 py-6 text-center text-sm text-slate-400">
          User details unavailable.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-700">Traveller</h2>
      </div>
      <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {/* Left: traveller's own contact info */}
        <div className="space-y-4 p-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Name</p>
            <div className="mt-1 flex items-center gap-2">
              <User className="h-4 w-4 text-slate-400" />
              <p className="text-sm font-medium text-slate-700">{user.fullName}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Phone</p>
            <div className="mt-1 flex items-center gap-2">
              <Phone className="h-4 w-4 text-slate-400" />
              {user.phone ? (
                <a href={`tel:${user.phone}`} className="text-sm text-primary hover:underline">
                  {user.phone}
                </a>
              ) : (
                <p className="text-sm text-slate-400">—</p>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Email</p>
            <div className="mt-1 flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-400" />
              {user.email ? (
                <a href={`mailto:${user.email}`} className="text-sm text-primary hover:underline">
                  {user.email}
                </a>
              ) : (
                <p className="text-sm text-slate-400">—</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: emergency contacts, with quick-call per screens.md A-04
            ("Emergency Contacts... quick-call button"). */}
        <div className="p-6">
          <div className="mb-2 flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Emergency Contacts
            </p>
          </div>
          {user.emergencyContacts.length === 0 ? (
            <p className="text-sm text-slate-400">No emergency contacts on file.</p>
          ) : (
            <ul className="space-y-3">
              {user.emergencyContacts.map((contact, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">{contact.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {contact.relationship ? `${contact.relationship} · ` : ''}
                      {contact.phone}
                    </p>
                  </div>
                  <a
                    href={`tel:${contact.phone}`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    <PhoneCall className="h-3.5 w-3.5" />
                    Call
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
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

  // Current caller's role, resolved client-side purely to decide whether to
  // *show* the Complete Trip button -- the actual restriction is enforced
  // server-side (PATCH /v1/admin/trips/:tripId/status rejects a 'completed'
  // request from anyone but admin/super_admin with a 403), so this is a UX
  // convenience, not the security boundary.
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  // Bumped on every real-time signal (WebSocket event or the polling
  // fallback below) that something on this page might be stale. Passed
  // down to EmergencyEventsSection/CheckInsSection/EscalationsSection so
  // they refetch too, not just the top-level trip object -- e.g. an
  // officer on another tab resolving an emergency should update this page
  // without a manual refresh.
  const [refreshSignal, setRefreshSignal] = useState(0);

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

  // Re-fetch (without the full-page loading spinner) whenever refreshSignal
  // ticks, but skip the very first render -- fetchTrip() above already
  // covers the initial load, and re-running it here too would just be a
  // redundant duplicate request on mount.
  const isFirstRefresh = useRef(true);
  useEffect(() => {
    if (isFirstRefresh.current) {
      isFirstRefresh.current = false;
      return;
    }
    apiClient<TripDetail>(`/v1/admin/trips/${id}`)
      .then(setTrip)
      .catch(() => {}); // Background refresh -- a transient failure here isn't worth surfacing.
  }, [refreshSignal, id]);

  useEffect(() => {
    apiClient<{ role: string }>('/v1/users/me')
      .then((data) => setCurrentUserRole(data.role))
      .catch(() => setCurrentUserRole(null));
  }, []);

  // Real-time updates -- WebSocket first, with a 60s polling fallback as a
  // safety net (per-trip escalation creation doesn't broadcast anything
  // server-side yet, and a dropped/reconnecting WS shouldn't leave this
  // page stale indefinitely). Mirrors MessagesSection's per-trip WS
  // subscription pattern elsewhere on this page.
  useEffect(() => {
    const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000/v1/ws';
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

    let ws: WebSocket | null = null;
    if (token) {
      ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      ws.onopen = () => ws?.send(JSON.stringify({ type: 'subscribe', tripId: id }));
      ws.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data as string) as { type: string; tripId?: string };
          if (
            envelope.tripId === id &&
            ['trip_status', 'emergency_alert', 'emergency_resolved'].includes(envelope.type)
          ) {
            setRefreshSignal((n) => n + 1);
          }
        } catch {
          // Ignore malformed WS messages.
        }
      };
      // No reconnect-on-close here (unlike useTripWebSocket) -- the 60s
      // poll below already covers the "WS dropped and didn't come back"
      // case for the lifetime of this page view.
    }

    const pollId = setInterval(() => setRefreshSignal((n) => n + 1), 60_000);

    return () => {
      ws?.close();
      clearInterval(pollId);
    };
  }, [id]);

  const handleCompleteTrip = async () => {
    if (!trip) return;
    setCompleting(true);
    setCompleteError(null);
    try {
      // PATCH /status returns the raw trip row only, not the enriched shape
      // (currentLocation/user/routePolyline) GET /:tripId provides -- refetch
      // via fetchTrip() rather than setTrip()-ing the PATCH response
      // directly, so the route map / traveller section don't lose their data.
      await apiClient(`/v1/admin/trips/${trip.id}/status`, {
        method: 'PATCH',
        body: { status: 'completed' },
      });
      await fetchTrip();
      setCompleteConfirmOpen(false);
    } catch (err) {
      setCompleteError('Failed to complete trip. It may no longer be completable from its current status.');
      console.error(err);
    } finally {
      setCompleting(false);
    }
  };

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
  // Complete Trip: admin-only (server-enforced, see PATCH /status's doc
  // comment), and only meaningful for a trip that isn't already terminal.
  const canComplete =
    !tripEnded && (currentUserRole === 'admin' || currentUserRole === 'super_admin');

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
          <div className="flex items-center gap-2">
            {canComplete && (
              <button
                onClick={() => { setCompleteConfirmOpen(true); setCompleteError(null); }}
                className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
              >
                <CheckCircle2 className="h-4 w-4" />
                Complete Trip
              </button>
            )}
            <button
              onClick={fetchTrip}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Complete confirmation -- an explicit second step rather than an
            immediate PATCH on click, since this ends monitoring outright. */}
        {completeConfirmOpen && (
          <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">
              Mark this trip as completed? This cannot be undone — the
              traveller and any tagged staff will stop being monitored.
            </p>
            {completeError && <p className="mt-2 text-xs text-red-600">{completeError}</p>}
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleCompleteTrip}
                disabled={completing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {completing ? 'Completing…' : 'Confirm Complete'}
              </button>
              <button
                onClick={() => { setCompleteConfirmOpen(false); setCompleteError(null); }}
                disabled={completing}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
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

      {/* Traveller info + emergency contacts (screens.md A-04). */}
      <TravellerSection user={trip.user} />

      {/* Route map: fixed planned route + ~2km safe-zone corridor +
          real-time/last-known position. See screens.md A-04's "Location
          Timeline" section -- this is that map. */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-700">Route Map</h2>
        </div>
        <div className="p-4">
          <TripRouteMap
            tripId={trip.id}
            origin={trip.origin}
            destination={trip.destination}
            routePolyline={trip.routePolyline}
            initialLocation={trip.currentLocation ?? null}
          />
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

      <EmergencyEventsSection tripId={trip.id} refreshSignal={refreshSignal} />

      <MessagesSection tripId={trip.id} tripEnded={tripEnded} />

      <CheckInsSection tripId={trip.id} tripEnded={tripEnded} refreshSignal={refreshSignal} />

      <EscalationsSection tripId={trip.id} tripEnded={tripEnded} refreshSignal={refreshSignal} />
    </div>
  );
}
