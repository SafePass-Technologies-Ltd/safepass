/// LiveTripMap — Google Maps component showing active trips as colour-coded markers.
///
/// Uses @vis.gl/react-google-maps (official Google library).
/// Markers are colour-coded by trip status:
///   Green  = active (normal)
///   Yellow = delayed
///   Red    = emergency / escalated
///
/// Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in environment.
'use client';

import { useMemo, useCallback } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { Shield } from 'lucide-react';
import type { ActiveTrip } from '@/hooks/useActiveTrips';

// ────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────

interface LiveTripMapProps {
  trips: ActiveTrip[];
  isLoading?: boolean;
  /** Called when a trip marker is clicked. */
  onTripClick?: (trip: ActiveTrip) => void;
  /** Selected trip ID (shows InfoWindow). */
  selectedTripId?: string | null;
}

// ────────────────────────────────────────────────────────────
// Status → colour mapping
// ────────────────────────────────────────────────────────────

const STATUS_COLOURS: Record<string, { bg: string; border: string; glyph: string }> = {
  active:     { bg: '#22C55E', border: '#16A34A', glyph: '#FFFFFF' },
  delayed:    { bg: '#EAB308', border: '#CA8A04', glyph: '#FFFFFF' },
  emergency:  { bg: '#EF4444', border: '#DC2626', glyph: '#FFFFFF' },
  escalated:  { bg: '#EF4444', border: '#DC2626', glyph: '#FFFFFF' },
  draft:      { bg: '#9CA3AF', border: '#6B7280', glyph: '#FFFFFF' },
  completed:  { bg: '#6B7280', border: '#4B5563', glyph: '#FFFFFF' },
  cancelled:  { bg: '#6B7280', border: '#4B5563', glyph: '#FFFFFF' },
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  delayed: 'Delayed',
  emergency: 'Emergency',
  escalated: 'Escalated',
  draft: 'Draft',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// ────────────────────────────────────────────────────────────
// Map bounds auto-fit
// ────────────────────────────────────────────────────────────

function FitBounds({ trips }: { trips: ActiveTrip[] }) {
  const map = useMap();

  const bounds = useMemo(() => {
    if (trips.length === 0) return null;
    const bounds = new google.maps.LatLngBounds();
    for (const trip of trips) {
      const loc = trip.currentLocation ?? trip.origin;
      if (loc.latitude && loc.longitude) {
        bounds.extend({ lat: loc.latitude, lng: loc.longitude });
      }
    }
    return bounds;
  }, [trips]);

  // Fit map to bounds when trips change (only if map is idle).
  useMemo(() => {
    if (map && bounds && !bounds.isEmpty()) {
      map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
    }
  }, [map, bounds]);

  return null;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export default function LiveTripMap({
  trips,
  isLoading,
  onTripClick,
  selectedTripId,
}: LiveTripMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <MapPlaceholder>
        <p className="text-sm text-amber-600">
          Missing <code className="rounded bg-amber-100 px-1 text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> environment variable.
        </p>
      </MapPlaceholder>
    );
  }

  // Default centre: Nigeria (Abuja).
  const defaultCenter = useMemo(() => ({ lat: 9.0765, lng: 7.3986 }), []);
  const defaultZoom = 6;

  return (
    <APIProvider apiKey={apiKey}>
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 shadow-lg">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm font-medium text-slate-600">Loading trips...</span>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && trips.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/80">
            <div className="text-center">
              <Shield className="mx-auto h-12 w-12 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-500">No active trips</p>
              <p className="text-xs text-slate-400">Trips will appear here once monitoring starts</p>
            </div>
          </div>
        )}

        <Map
          mapId="safepass-live-trip-map"
          defaultCenter={defaultCenter}
          defaultZoom={defaultZoom}
          gestureHandling="greedy"
          disableDefaultUI={false}
          className="h-[600px] w-full"
        >
          <FitBounds trips={trips} />

          {trips
            .filter((trip) => {
              const loc = trip.currentLocation ?? trip.origin;
              return loc.latitude && loc.longitude;
            })
            .map((trip) => {
              const loc = trip.currentLocation ?? trip.origin;
              const colours = STATUS_COLOURS[trip.status] ?? STATUS_COLOURS.active;
              const isSelected = selectedTripId === trip.id;

              return (
                <AdvancedMarker
                  key={trip.id}
                  position={{ lat: loc.latitude, lng: loc.longitude }}
                  onClick={() => onTripClick?.(trip)}
                >
                  <Pin
                    background={colours.bg}
                    borderColor={colours.border}
                    glyphColor={colours.glyph}
                    scale={isSelected ? 1.3 : 1}
                  />
                  {isSelected && (
                    <InfoWindow
                      position={{ lat: loc.latitude, lng: loc.longitude }}
                      onClose={() => onTripClick?.(trip)}
                    >
                      <TripInfoCard trip={trip} />
                    </InfoWindow>
                  )}
                </AdvancedMarker>
              );
            })}
        </Map>
      </div>
    </APIProvider>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function MapPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex h-[600px] items-center justify-center bg-slate-100">
        <div className="max-w-sm text-center">{children}</div>
      </div>
    </div>
  );
}

function TripInfoCard({ trip }: { trip: ActiveTrip }) {
  const colours = STATUS_COLOURS[trip.status] ?? STATUS_COLOURS.active;

  return (
    <div className="min-w-[220px] max-w-[280px] p-3">
      {/* Status badge */}
      <span
        className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white"
        style={{ backgroundColor: colours.bg }}
      >
        {STATUS_LABELS[trip.status] ?? trip.status}
      </span>

      {/* Route */}
      <p className="mt-2 text-sm font-medium text-slate-800">
        {trip.origin.name ?? `${trip.origin.latitude.toFixed(3)}, ${trip.origin.longitude.toFixed(3)}`}
        <span className="mx-1 text-slate-400">→</span>
        {trip.destination.name ?? `${trip.destination.latitude.toFixed(3)}, ${trip.destination.longitude.toFixed(3)}`}
      </p>

      {/* Mode + vehicle */}
      <div className="mt-1 text-xs text-slate-500">
        {trip.tripMode === 'driver' ? '🚗 Driver' : '🚌 Passenger'}
        {trip.vehiclePlateNumber && (
          <span className="ml-2">• {trip.vehiclePlateNumber}</span>
        )}
        {trip.transportCompany && (
          <span className="ml-2">• {trip.transportCompany}</span>
        )}
      </div>

      {/* Speed (if available) */}
      {trip.currentLocation?.speed != null && (
        <p className="mt-1 text-xs text-slate-400">
          {trip.currentLocation.speed.toFixed(0)} km/h
        </p>
      )}

      {/* Started time */}
      {trip.startedAt && (
        <p className="mt-1 text-xs text-slate-400">
          Started {new Date(trip.startedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
