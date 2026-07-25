/// TripRouteMap — single-trip route map for the Trip Detail page.
///
/// Distinct from live-trip-map.tsx (the fleet-wide map on the Trip
/// Management list): this shows exactly one trip's planned route, a
/// "safe zone" corridor around that route, and the trip's real-time (or
/// last-known) GPS position.
///
/// Layering, bottom to top (per the product spec this was built against):
///   1. Safe-zone corridor polygon (faded fill, ~2km either side of the
///      straight origin-destination line)
///   2. Route polyline (the trip's fixed, one-time-computed route -- see
///      directions.service.ts's doc comment for why this never changes
///      after trip creation, decoded from trip.routePolyline, or a
///      straight line fallback if no polyline was ever computed)
///   3. Origin / destination pins, and the live/last-known position marker
'use client';

import { useMemo, useEffect, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, Polyline, Polygon, useMap } from '@vis.gl/react-google-maps';
import { decode } from '@googlemaps/polyline-codec';
import { MapPin as MapPinIcon } from 'lucide-react';
import { buildSafeZoneCorridor, type LatLng } from '@/lib/geo';
import { useTripLiveLocation, type TripLocation } from '@/hooks/useTripLiveLocation';

// ────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────

/** Safe-zone corridor half-width, per product decision: ~2km each side of
 * the straight origin-destination line. */
const SAFE_ZONE_BUFFER_METERS = 2_000;

// ────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────

interface TripRouteMapProps {
  tripId: string;
  origin: LatLng & { name?: string };
  destination: LatLng & { name?: string };
  /** Encoded Google polyline (trip.routePolyline), or null/undefined if
   * none was ever computed (falls back to a straight origin-destination
   * line -- see directions.service.ts). */
  routePolyline?: string | null;
  /** currentLocation as resolved server-side by GET /v1/admin/trips/:tripId
   * (DynamoDB live position -> trip_location_history breadcrumb fallback,
   * or null for a trip with no GPS fix at all). Seeds the live position
   * marker; useTripLiveLocation keeps it updated in real time thereafter. */
  initialLocation: TripLocation | null;
}

// ────────────────────────────────────────────────────────────
// Fit bounds to the safe zone (the largest element) on first render.
// ────────────────────────────────────────────────────────────

function FitToSafeZone({ corridor }: { corridor: LatLng[] }) {
  const map = useMap();
  const hasFit = useRef(false);

  useEffect(() => {
    if (hasFit.current || !map || corridor.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    for (const point of corridor) {
      bounds.extend({ lat: point.latitude, lng: point.longitude });
    }
    map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
    hasFit.current = true;
  }, [map, corridor]);

  return null;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export default function TripRouteMap({
  tripId,
  origin,
  destination,
  routePolyline,
  initialLocation,
}: TripRouteMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const currentLocation = useTripLiveLocation(tripId, initialLocation);

  // Decode the fixed route once. Falls back to a straight origin-
  // destination line -- still fixed/non-dynamic, just less road-accurate --
  // if no polyline was ever computed (e.g. Directions API was unavailable
  // at trip creation, or this is a trip created before this feature).
  const routePath = useMemo<LatLng[]>(() => {
    if (routePolyline) {
      try {
        const decoded = decode(routePolyline, 5);
        if (decoded.length > 0) {
          return decoded.map(([latitude, longitude]) => ({ latitude, longitude }));
        }
      } catch {
        // Malformed polyline -- fall through to the straight-line fallback.
      }
    }
    return [origin, destination];
  }, [routePolyline, origin, destination]);

  // Safe-zone corridor is always derived from the straight origin-
  // destination line (not the road route), per the product spec -- a fixed
  // geometric buffer, not a route-following one. See buildSafeZoneCorridor's
  // doc comment.
  const safeZoneCorridor = useMemo(
    () => buildSafeZoneCorridor(origin, destination, SAFE_ZONE_BUFFER_METERS),
    [origin, destination]
  );

  if (!apiKey) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-xl border border-slate-200 bg-slate-100">
        <p className="max-w-sm text-center text-sm text-amber-600">
          Missing <code className="rounded bg-amber-100 px-1 text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> environment variable.
        </p>
      </div>
    );
  }

  const routePathLiteral = routePath.map((p) => ({ lat: p.latitude, lng: p.longitude }));
  const safeZonePathLiteral = safeZoneCorridor.map((p) => ({ lat: p.latitude, lng: p.longitude }));

  return (
    <APIProvider apiKey={apiKey}>
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
        <Map
          mapId="safepass-trip-route-map"
          defaultCenter={{ lat: origin.latitude, lng: origin.longitude }}
          defaultZoom={10}
          gestureHandling="greedy"
          disableDefaultUI={false}
          className="h-[420px] w-full"
        >
          <FitToSafeZone corridor={safeZoneCorridor} />

          {/* Layer 1 (bottom): faded safe-zone corridor. */}
          <Polygon
            paths={safeZonePathLiteral}
            fillColor="#3B82F6"
            fillOpacity={0.12}
            strokeColor="#3B82F6"
            strokeOpacity={0.35}
            strokeWeight={1.5}
            zIndex={1}
          />

          {/* Layer 2: the trip's fixed route, always drawn above the safe zone. */}
          <Polyline
            path={routePathLiteral}
            strokeColor="#1D4ED8"
            strokeOpacity={0.9}
            strokeWeight={4}
            zIndex={2}
          />

          {/* Layer 3 (top): origin / destination / live-position markers. */}
          <AdvancedMarker position={{ lat: origin.latitude, lng: origin.longitude }} zIndex={3}>
            <Pin background="#22C55E" borderColor="#16A34A" glyphColor="#FFFFFF" />
          </AdvancedMarker>

          <AdvancedMarker position={{ lat: destination.latitude, lng: destination.longitude }} zIndex={3}>
            <Pin background="#6B7280" borderColor="#4B5563" glyphColor="#FFFFFF" />
          </AdvancedMarker>

          {currentLocation && (
            <AdvancedMarker
              position={{ lat: currentLocation.latitude, lng: currentLocation.longitude }}
              zIndex={4}
            >
              <Pin background="#EF4444" borderColor="#DC2626" glyphColor="#FFFFFF" scale={1.1} />
            </AdvancedMarker>
          )}
        </Map>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Origin
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> Destination
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Current position
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPinIcon className="h-3 w-3" /> Safe zone: ~{(SAFE_ZONE_BUFFER_METERS / 1000).toFixed(0)}km corridor
          </span>
        </div>
      </div>
    </APIProvider>
  );
}
