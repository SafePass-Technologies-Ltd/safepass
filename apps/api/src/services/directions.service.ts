/**
 * Directions Service — computes a trip's planned route **once**, at trip
 * creation, via a single Google Directions API call.
 *
 * Deliberately NOT a general-purpose routing utility that gets re-invoked
 * on every map render: the Trip Detail route map (screens.md A-04 "Location
 * Timeline") shows this as a fixed reference path so a monitoring officer
 * can tell whether a traveller has deviated from their *assigned* route --
 * that only means something if the displayed route never changes after the
 * fact. If this were recomputed live (e.g. from the traveller's actual GPS
 * breadcrumbs, or re-queried against current traffic conditions each time
 * the page loads), the "planned route" would silently drift into just
 * being "wherever they went," defeating the point. So: compute once at
 * createTrip(), persist the encoded polyline to trips.route_polyline
 * (existing column), and every later read just returns that stored value.
 *
 * Best-effort: a missing API key, quota failure, or network error all
 * result in `null` rather than blocking trip creation -- the Trip Detail
 * map falls back to a straight origin-destination line in that case (see
 * trip-route-map.tsx on the admin-dashboard), which is still a fixed,
 * non-dynamic reference line, just less road-accurate.
 */
import { env } from '../env';
import type { Location } from '../db/schema/types';

const GOOGLE_DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';

/** Directions API call must not hang trip creation indefinitely. */
const DIRECTIONS_TIMEOUT_MS = 5_000;

interface DirectionsResponse {
  status: string;
  routes: { overview_polyline: { points: string } }[];
}

/**
 * Fetch a single driving route between two points and return its encoded
 * overview polyline (standard Google polyline algorithm -- decodable by
 * @googlemaps/polyline-codec on the frontend). Returns null if
 * GOOGLE_MAPS_API_KEY isn't configured, the API call fails, times out, or
 * returns no route.
 */
export async function computeFixedRoutePolyline(
  origin: Location,
  destination: Location
): Promise<string | null> {
  if (!env.GOOGLE_MAPS_API_KEY) return null;

  const url = new URL(GOOGLE_DIRECTIONS_URL);
  url.searchParams.set('origin', `${origin.latitude},${origin.longitude}`);
  url.searchParams.set('destination', `${destination.latitude},${destination.longitude}`);
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('key', env.GOOGLE_MAPS_API_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DIRECTIONS_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    const json = (await res.json()) as DirectionsResponse;

    if (json.status !== 'OK' || json.routes.length === 0) {
      console.warn('[directions] no route found, status=%s', json.status);
      return null;
    }

    return json.routes[0].overview_polyline.points;
  } catch (err: unknown) {
    // Network error, timeout (AbortError), or malformed response -- none of
    // these should ever fail trip creation. The caller (createTrip) treats
    // a null return as "fall back to a straight line" and moves on.
    console.warn('[directions] route computation failed:', (err as Error)?.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
