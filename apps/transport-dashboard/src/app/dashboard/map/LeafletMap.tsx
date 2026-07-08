/// LeafletMap — client-only map component for the transport dashboard's
/// Trip Map (Screen 38).
///
/// Loaded via Next.js dynamic() with ssr:false so Leaflet's DOM globals
/// (window, document, navigator) are always available on first render.
///
/// Leaflet's default icon PNGs reference `/images/marker-icon.png` etc.
/// which are not bundled by Next.js. We override the icon prototype once
/// per module load so all markers use the CDN copies instead -- same
/// approach as apps/corporate-dashboard's LeafletMap.tsx.

'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { MonitoredTrip } from './page';

// ── Fix default marker icons (Next.js build strips the asset URLs) ────────────

const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

// Patch once at module level — safe because this file is only ever executed
// in the browser (dynamic import with ssr:false).
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

// Colour-coded marker icons by trip status (mirrors the admin dashboard's
// Live Trip Map convention: green/amber/red).
const COLOR_ICONS: Record<string, L.Icon> = {
  active: markerIcon('#22C55E'),
  delayed: markerIcon('#EAB308'),
  emergency: markerIcon('#EF4444'),
  escalated: markerIcon('#EF4444'),
};

function markerIcon(color: string): L.Icon {
  // Simple coloured circle SVG data URI -- avoids needing separate PNG
  // assets per colour.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
    <path d="M16 0C7.163 0 0 7.163 0 16c0 11 16 26 16 26s16-15 16-26C32 7.163 24.837 0 16 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="16" cy="16" r="6" fill="#fff"/>
  </svg>`;
  return L.icon({
    iconUrl: `data:image/svg+xml;base64,${typeof window !== 'undefined' ? window.btoa(svg) : ''}`,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -38],
  });
}

// ── Auto-fit bounds whenever the trip count changes ───────────────────────────

function FitBounds({ trips }: { trips: MonitoredTrip[] }) {
  const map = useMap();
  const prevCount = useRef(0);

  useEffect(() => {
    if (trips.length === 0) return;
    // Only re-fit when the number of trips changes to avoid fighting the
    // user while they are panning/zooming.
    if (trips.length === prevCount.current) return;
    prevCount.current = trips.length;

    const points = trips.map((t) => [t.position.latitude, t.position.longitude] as [number, number]);
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
  trips: MonitoredTrip[];
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
        const { latitude: lat, longitude: lng } = trip.position;
        if (!lat || !lng) return null;

        return (
          <Marker key={trip.id} position={[lat, lng]} icon={COLOR_ICONS[trip.status] ?? COLOR_ICONS.active}>
            <Popup>
              <div className="min-w-[180px] text-sm">
                <p className="font-semibold text-slate-800">
                  {trip.driverName ?? `Trip ${trip.id.slice(0, 8)}…`}
                </p>
                {trip.vehiclePlateNumber && (
                  <p className="text-xs text-slate-500">{trip.vehiclePlateNumber}</p>
                )}
                <p className="mt-1 text-xs capitalize text-slate-600">{trip.status}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {trip.isLive ? 'Live position' : 'Origin (no GPS fix yet)'}
                </p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
