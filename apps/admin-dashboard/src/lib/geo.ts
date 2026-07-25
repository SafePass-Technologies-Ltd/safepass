/// Geo utilities for the Trip Detail route map — computing the oriented
/// "safe zone" corridor rectangle around a trip's origin/destination line.
///
/// Kept dependency-free (no turf.js etc.) since this is the only geometry
/// the admin-dashboard needs beyond polyline decoding (@googlemaps/polyline-codec).

const EARTH_RADIUS_METERS = 6_371_000;

export interface LatLng {
  latitude: number;
  longitude: number;
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Initial bearing (degrees, 0-360) travelling from `from` to `to`. */
export function bearingBetween(from: LatLng, to: LatLng): number {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const dLng = toRadians(to.longitude - from.longitude);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/** Great-circle distance between two points, in metres (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * Project a point `distanceM` metres from `origin` along `bearingDeg`
 * (standard destination-point formula). Used to build the four corners of
 * the safe-zone rectangle.
 */
export function destinationPoint(
  origin: LatLng,
  bearingDeg: number,
  distanceM: number
): LatLng {
  const angularDistance = distanceM / EARTH_RADIUS_METERS;
  const bearing = toRadians(bearingDeg);
  const lat1 = toRadians(origin.latitude);
  const lng1 = toRadians(origin.longitude);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return { latitude: toDegrees(lat2), longitude: toDegrees(lng2) };
}

/**
 * Build the four corners of an oriented "safe zone" rectangle: a corridor
 * running from `origin` to `destination`, `bufferMeters` wide on each side
 * of that line (so the rectangle's long edges run parallel to the route,
 * not just an axis-aligned bounding box). Returned as a closed ring
 * (5 points, first === last) ready to hand to a Google Maps Polygon's path.
 *
 * This is deliberately just a fixed geometric buffer around the straight
 * origin-destination line, not around the (possibly winding) route
 * polyline itself -- matches the "rectangular... around origin to
 * destination" safe-zone spec, and keeps the corners trivial to compute
 * (four destinationPoint calls) rather than needing a general polyline-
 * buffering algorithm.
 */
export function buildSafeZoneCorridor(
  origin: LatLng,
  destination: LatLng,
  bufferMeters: number
): LatLng[] {
  const forwardBearing = bearingBetween(origin, destination);
  const leftBearing = (forwardBearing - 90 + 360) % 360;
  const rightBearing = (forwardBearing + 90) % 360;

  // Four corners: near-left, near-right, far-right, far-left (winding order
  // matters for a well-formed polygon, not just a self-intersecting bowtie).
  const nearLeft = destinationPoint(origin, leftBearing, bufferMeters);
  const nearRight = destinationPoint(origin, rightBearing, bufferMeters);
  const farRight = destinationPoint(destination, rightBearing, bufferMeters);
  const farLeft = destinationPoint(destination, leftBearing, bufferMeters);

  return [nearLeft, nearRight, farRight, farLeft, nearLeft];
}
