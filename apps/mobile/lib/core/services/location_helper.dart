/// Location Helper — a single, fast, reliable way to get "the user's current
/// position" for one-shot use cases (map recenter, incident report GPS
/// capture, trip origin detection). NOT used for continuous trip tracking
/// (see trip_monitoring_cubit.dart's own getPositionStream setup, which is a
/// different concern with different tradeoffs).
///
/// Why this exists: every call site that used to call
/// `Geolocator.getCurrentPosition()` directly hit the same two problems:
///   1. No `timeLimit` at all (or a too-short one) meant either hanging for
///      30+ seconds waiting for a precise GPS-only fix (classic "time to
///      first fix" cold-start delay, worse indoors/underground/weak signal),
///      or throwing a `TimeoutException` ("GPS timed out") far too eagerly.
///   2. No fallback to a cached last-known position, even though one is
///      usually available and "good enough" for a map recenter or an
///      incident report's location tag — precision to the metre isn't the
///      point there, getting *a* reasonable position quickly is.
library;

import 'dart:async';
import 'package:geolocator/geolocator.dart';

/// Gets the current position quickly, preferring a fresh GPS fix but never
/// blocking longer than [timeLimit] for one. If a fresh fix isn't ready in
/// time, falls back to the last known cached position (if any) rather than
/// throwing -- a slightly-stale "good enough" position beats a hard error
/// for map recenter/incident-report/trip-origin use cases.
///
/// Only throws if there is truly no position available at all: no fresh fix
/// within [timeLimit] AND no cached last-known position either (e.g. first
/// ever launch, GPS fully cold with no prior fix in the OS's cache).
///
/// [accuracy] defaults to `.high` (not `.best`) -- `.best` forces the
/// highest possible precision, which takes meaningfully longer to lock and
/// buys nothing for these one-shot use cases.
Future<Position> getQuickPosition({
  LocationAccuracy accuracy = LocationAccuracy.high,
  Duration timeLimit = const Duration(seconds: 15),
}) async {
  try {
    return await Geolocator.getCurrentPosition(
      locationSettings: LocationSettings(
        accuracy: accuracy,
        timeLimit: timeLimit,
      ),
    );
  } on TimeoutException {
    final lastKnown = await Geolocator.getLastKnownPosition();
    if (lastKnown != null) return lastKnown;
    rethrow;
  }
}
