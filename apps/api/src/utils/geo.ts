/**
 * Geo Utilities — shared distance calculations used across trip services.
 *
 * Extracted from trip-archive.service.ts (which originally had a private
 * copy for its significant-change sampling filter) so trip.service.ts's
 * destination-arrival detection can use the exact same formula rather than
 * maintaining a second copy.
 */

/** Haversine great-circle distance between two points, in meters. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
