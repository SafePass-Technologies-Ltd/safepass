/// MarkerLocationPicker — click-to-place map location picker for the
/// Map Markers "Add Marker" form (apps/admin-dashboard/src/app/dashboard/
/// markers/page.tsx), replacing plain lat/lng number inputs.
///
/// Three ways to set a location:
///   1. Click anywhere on the map.
///   2. Type in the search box (debounced autocomplete via the API's
///      geocoding proxy — GET /v1/geocoding/autocomplete + /place — so no
///      separate client-side Places library/key is needed).
///   3. Drag the marker once it's placed, to fine-tune the exact spot.
///
/// Uses the same @vis.gl/react-google-maps stack as live-trip-map.tsx.
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps';
import { Search, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface PlaceSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface MarkerLocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
}

const DEFAULT_CENTER = { lat: 9.0765, lng: 7.3986 }; // Abuja, Nigeria
const DEFAULT_ZOOM = 6;
const SELECTED_ZOOM = 15;

/** Recenters the map whenever the selected position changes (search result,
 * not every drag/click — panning during those would fight the user's own
 * map interaction). */
function RecenterOnSelect({ position }: { position: { lat: number; lng: number } | null }) {
  const map = useMap();
  const lastCentered = useRef<string | null>(null);

  useEffect(() => {
    if (!map || !position) return;
    const key = `${position.lat},${position.lng}`;
    if (lastCentered.current === key) return;
    lastCentered.current = key;
    map.panTo(position);
    map.setZoom(SELECTED_ZOOM);
  }, [map, position]);

  return null;
}

export default function MarkerLocationPicker({
  latitude,
  longitude,
  onChange,
}: MarkerLocationPickerProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  // Set only on an explicit search selection -- drives RecenterOnSelect.
  // Plain clicks/drags update `latitude`/`longitude` via onChange without
  // forcing a re-center, so the map doesn't jump under the user's cursor.
  const [searchedPosition, setSearchedPosition] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const position = latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null;

  const runSearch = useCallback(async (value: string) => {
    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    try {
      const res = await apiClient<{ data: PlaceSuggestion[] }>(
        `/v1/geocoding/autocomplete?query=${encodeURIComponent(value)}`
      );
      setSuggestions(res.data ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    setShowSuggestions(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), 350);
  }

  async function handleSelectSuggestion(suggestion: PlaceSuggestion) {
    setShowSuggestions(false);
    setQuery(suggestion.description);
    try {
      const res = await apiClient<{ data: { lat: number; lng: number } }>(
        `/v1/geocoding/place?placeId=${encodeURIComponent(suggestion.placeId)}`
      );
      onChange(res.data.lat, res.data.lng);
      setSearchedPosition({ lat: res.data.lat, lng: res.data.lng });
    } catch {
      // Non-fatal — user can still click the map directly.
    }
  }

  if (!apiKey) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        Missing <code className="rounded bg-amber-100 px-1 text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> —
        location picker unavailable.
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <div className="space-y-2">
        <div className="relative">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search for a place or address..."
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-9 text-sm"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
            )}
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              {suggestions.map((s) => (
                <li key={s.placeId}>
                  <button
                    type="button"
                    onClick={() => handleSelectSuggestion(s)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-700">{s.mainText}</span>
                    {s.secondaryText && (
                      <span className="ml-1 text-slate-400">{s.secondaryText}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200">
          <Map
            mapId="safepass-marker-picker"
            defaultCenter={position ?? DEFAULT_CENTER}
            defaultZoom={position ? SELECTED_ZOOM : DEFAULT_ZOOM}
            gestureHandling="greedy"
            disableDefaultUI={false}
            className="h-[320px] w-full"
            onClick={(e) => {
              const latLng = e.detail.latLng;
              if (!latLng) return;
              onChange(latLng.lat, latLng.lng);
            }}
          >
            <RecenterOnSelect position={searchedPosition} />

            {position && (
              <AdvancedMarker
                position={position}
                draggable
                onDragEnd={(e) => {
                  const latLng = e.latLng;
                  if (!latLng) return;
                  onChange(latLng.lat(), latLng.lng());
                }}
              >
                <Pin background="#EF4444" borderColor="#DC2626" glyphColor="#FFFFFF" />
              </AdvancedMarker>
            )}
          </Map>
        </div>

        <p className="text-xs text-slate-400">
          {position
            ? `Selected: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)} — drag the marker or click elsewhere to adjust.`
            : 'Click on the map or search above to place the marker.'}
        </p>
      </div>
    </APIProvider>
  );
}
