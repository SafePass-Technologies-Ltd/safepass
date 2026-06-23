/// LeafletMap — client-only map component for the corporate dashboard.
///
/// Loaded via Next.js dynamic() with ssr:false so Leaflet's DOM globals
/// (window, document, navigator) are always available on first render.
///
/// Leaflet's default icon PNGs reference `/images/marker-icon.png` etc.
/// which are not bundled by Next.js. We override the icon prototype once
/// per module load so all markers use the CDN copies instead.

'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Trip } from './page';

// ── Fix default marker icons (Next.js build strips the asset URLs) ────────────

const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

// Patch once at module level — safe because this file is only ever executed
// in the browser (dynamic import with ssr:false).
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

// ── Auto-fit bounds whenever the trips list changes ───────────────────────────

function FitBounds({ trips }: { trips: Trip[] }) {
  const map = useMap();
  const prevCount = useRef(0);

  useEffect(() => {
    if (trips.length === 0) return;
    // Only re-fit when the number of trips changes to avoid fighting the user
    // while they are panning/zooming.
    if (trips.length === prevCount.current) return;
    prevCount.current = trips.length;

    const points = trips.map((t) => [t.origin.latitude, t.origin.longitude] as [number, number]);
    if (points.length === 1) {
      map.setView(points[0], 12);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    }
  }, [map, trips]);

  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface LeafletMapProps {
  trips: Trip[];
}

// Default centre: Abuja, Nigeria.
const DEFAULT_CENTER: [number, number] = [9.0765, 7.3986];
const DEFAULT_ZOOM = 6;

export default function LeafletMap({ trips }: LeafletMapProps) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      style={{ height: '520px', width: '100%' }}
    >
      {/* OpenStreetMap tile layer — free, no API key required */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitBounds trips={trips} />

      {trips.map((trip) => {
        const { latitude: lat, longitude: lng } = trip.origin;
        if (!lat || !lng) return null;

        return (
          <Marker key={trip.id} position={[lat, lng]}>
            <Popup>
              <div className="min-w-[180px] text-sm">
                <p className="font-semibold text-slate-800">
                  {trip.driverName ?? `User ${trip.userId.slice(0, 8)}…`}
                </p>
                {trip.vehiclePlateNumber && (
                  <p className="text-xs text-slate-500">{trip.vehiclePlateNumber}</p>
                )}
                <p className="mt-1 text-xs text-slate-600">
                  {trip.origin.name} → {trip.destination.name}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Updated {new Date(trip.updatedAt).toLocaleTimeString()}
                </p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
