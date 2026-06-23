/// Admin Dashboard — Main Page (Live Trip Map + Stats).
///
/// GPS positions are delivered in real-time via WebSocket (useTripWebSocket).
/// SWR continues to poll every 30s for trip metadata (status, route, vehicle
/// info) which changes infrequently and is not on the WebSocket channel.
/// The two data sources are merged: WebSocket positions override the
/// currentLocation field from the REST response.
'use client';

import { useState, useEffect } from 'react';
import { MapPin, AlertTriangle, Users, Activity, MessageCircle } from 'lucide-react';
import { useActiveTrips } from '@/hooks/useActiveTrips';
import { useDashboardWs } from '@/hooks/useDashboardWebSocket';
import LiveTripMap from '@/components/map/live-trip-map';
import type { ActiveTrip } from '@/hooks/useActiveTrips';
import { apiClient } from '@/lib/api-client';

export default function DashboardPage() {
  // Poll for trip metadata at a slower cadence — position updates come via WS.
  const { trips, isLoading, error, isRefreshing } = useActiveTrips(30_000);
  // Read livePositions and connected from the layout's shared WebSocket context.
  // useDashboardWs() reads DashboardWsContext — no second connection is opened.
  const { livePositions, connected } = useDashboardWs();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  // Overlay live WebSocket GPS positions on top of the REST trip data.
  // The WebSocket position wins when both sources have a value for the same trip.
  const tripsWithLivePosition: ActiveTrip[] = trips.map((trip) => {
    const live = livePositions.get(trip.id);
    if (!live) return trip;
    return {
      ...trip,
      currentLocation: {
        latitude: live.latitude,
        longitude: live.longitude,
        speed: live.speed ?? undefined,
        heading: live.heading ?? undefined,
        timestamp: live.timestamp,
      },
    };
  });

  // Poll unread message count every 60s for the badge stat card.
  useEffect(() => {
    let cancelled = false;
    const fetchCount = () => {
      apiClient<{ count: number }>('/v1/admin/messages/unread-count')
        .then((data) => { if (!cancelled) setUnreadCount(data.count); })
        .catch(() => { /* non-blocking */ });
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Real-time unread count update — increment immediately when a traveller
  // sends a message without waiting for the next 60s poll cycle.
  // The layout dispatches 'sp:new_message' for every new_message WS event
  // where senderRole === 'user', so no extra filtering is needed here.
  useEffect(() => {
    function onNewMessage(_evt: Event) {
      setUnreadCount((prev) => (prev === null ? 1 : prev + 1));
    }
    window.addEventListener('sp:new_message', onNewMessage);
    return () => window.removeEventListener('sp:new_message', onNewMessage);
  }, []);

  // ── Derived stats ──────────────────────────────────────
  const activeCount = trips.filter(
    (t) => t.status === 'active' || t.status === 'delayed'
  ).length;
  const emergencyCount = trips.filter(
    (t) => t.status === 'emergency' || t.status === 'escalated'
  ).length;
  const uniqueUsers = new Set(trips.map((t) => t.userId)).size;

  function handleTripClick(trip: ActiveTrip) {
    setSelectedTripId((prev) => (prev === trip.id ? null : trip.id));
  }

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatsCard
          title="Active Trips"
          value={isLoading ? '...' : `${activeCount}`}
          change={`${trips.length} total` + (isRefreshing ? ' • refreshing' : '')}
          changeType={activeCount > 0 ? 'positive' : 'neutral'}
          icon={MapPin}
        />
        <StatsCard
          title="Emergency"
          value={isLoading ? '...' : `${emergencyCount}`}
          change={emergencyCount > 0 ? 'Immediate attention' : 'No emergencies'}
          changeType={emergencyCount > 0 ? 'negative' : 'neutral'}
          icon={AlertTriangle}
        />
        <StatsCard
          title="Users Monitored"
          value={isLoading ? '...' : `${uniqueUsers}`}
          change={`${trips.length} trips in progress`}
          changeType="neutral"
          icon={Users}
        />
        {/* Unread messages badge — drives awareness without a separate sidebar item */}
        <StatsCard
          title="Unread Messages"
          value={unreadCount === null ? '...' : `${unreadCount}`}
          change={
            unreadCount === null
              ? 'Loading…'
              : unreadCount > 0
              ? 'From travellers — open a trip to reply'
              : 'All caught up'
          }
          changeType={unreadCount !== null && unreadCount > 0 ? 'negative' : 'neutral'}
          icon={MessageCircle}
        />
        <StatsCard
          title="Live Feed"
          value={connected ? '●' : '○'}
          change={connected ? `WebSocket live · ${livePositions.size} positions` : 'Reconnecting...'}
          changeType={connected ? 'positive' : 'neutral'}
          icon={Activity}
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Live trip map — receives merged trip data with real-time GPS positions */}
      <LiveTripMap
        trips={tripsWithLivePosition}
        isLoading={isLoading && trips.length === 0}
        selectedTripId={selectedTripId}
        onTripClick={handleTripClick}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Stats Card
// ────────────────────────────────────────────────────────────

interface StatsCardProps {
  title: string;
  value: string;
  change: string;
  changeType: 'positive' | 'negative' | 'neutral';
  icon: React.ComponentType<{ className?: string }>;
}

function StatsCard({ title, value, change, changeType, icon: Icon }: StatsCardProps) {
  const changeColour =
    changeType === 'positive'
      ? 'text-safety-green'
      : changeType === 'negative'
        ? 'text-safety-red'
        : 'text-slate-500';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <Icon className="h-5 w-5 text-slate-400" />
      </div>
      <p className="mt-2 text-3xl font-bold text-slate-dark">{value}</p>
      <p className={`mt-1 text-xs ${changeColour}`}>{change}</p>
    </div>
  );
}
