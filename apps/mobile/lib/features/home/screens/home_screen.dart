/// Home Screen — Map view with quick actions and active trip status.
///
/// Shows a Google Map with the user's current location. If an active
/// trip is in progress, shows trip status with a "View Trip" button.
/// Otherwise, shows a "Start New Trip" call-to-action.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme.dart';
import '../../../app/router.dart';
import '../../../core/constants.dart';
import '../../../core/services/location_helper.dart';
import '../../trips/cubit/trip_monitoring_cubit.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  GoogleMapController? _mapController;
  StreamSubscription<Position>? _positionSubscription;
  static const _defaultCenter = LatLng(9.0765, 7.3986); // Nigeria centre

  /// Whether the camera should keep following the user's live location.
  /// Turned off as soon as the user pans/zooms the map themselves, and
  /// turned back on when they tap the "My Location" button.
  bool _followUser = true;

  /// True while we're moving the camera ourselves (not the user), so
  /// [onCameraMoveStarted] can tell a programmatic move apart from a
  /// user gesture and avoid disabling follow mode by mistake.
  bool _isProgrammaticMove = false;

  @override
  void dispose() {
    _positionSubscription?.cancel();
    super.dispose();
  }

  Future<void> _startTrackingUserLocation() async {
    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return;
    }

    // Snap to the last known cached position immediately (near-instant) so
    // the map doesn't sit on the default Nigeria-wide view for however long
    // the position stream's first fresh fix takes to arrive -- that first
    // fix alone can take 30s+ on a cold GPS lock, especially indoors.
    final lastKnown = await Geolocator.getLastKnownPosition();
    if (lastKnown != null && _followUser && _mapController != null) {
      unawaited(
        _animateCamera(LatLng(lastKnown.latitude, lastKnown.longitude)),
      );
    }

    unawaited(_positionSubscription?.cancel());
    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      ),
    ).listen((position) {
      if (!_followUser || _mapController == null) return;
      _animateCamera(LatLng(position.latitude, position.longitude));
    });
  }

  Future<void> _animateCamera(LatLng target, {double zoom = 15}) async {
    _isProgrammaticMove = true;
    await _mapController?.animateCamera(
      CameraUpdate.newLatLngZoom(target, zoom),
    );
    _isProgrammaticMove = false;
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<TripMonitoringCubit, TripMonitoringState>(
      // Redirect to the active trip screen as soon as a trip becomes active
      // (e.g. started from another entry point or resumed from background).
      listenWhen: (prev, curr) =>
          (curr.status == TripMonitorStatus.active ||
              curr.status == TripMonitorStatus.gpsUpdating) &&
          curr.trip != null &&
          prev.status != TripMonitorStatus.active &&
          prev.status != TripMonitorStatus.gpsUpdating,
      listener: (context, state) =>
          context.go('/trip/active/${state.trip!.id}'),
      builder: (context, tripState) {
        final tripActive = tripState.status == TripMonitorStatus.active ||
            tripState.status == TripMonitorStatus.gpsUpdating;

        return Scaffold(
          body: Stack(
            children: [
              // Google Maps.
              GoogleMap(
                initialCameraPosition: const CameraPosition(
                  target: _defaultCenter,
                  zoom: 7,
                ),
                myLocationEnabled: true,
                myLocationButtonEnabled: false,
                zoomControlsEnabled: false,
                trafficEnabled: true,
                onMapCreated: (controller) {
                  _mapController = controller;
                  _startTrackingUserLocation();
                },
                onCameraMoveStarted: () {
                  if (!_isProgrammaticMove) {
                    _followUser = false;
                  }
                },
              ),

              // Pulsing "LIVE" badge — top-right corner, visible when trip is active.
              if (tripActive)
                Positioned(
                  top: MediaQuery.of(context).padding.top + 12,
                  right: 16,
                  child: const _LiveTripBadge(),
                ),

              // Bottom sheet — trip status + Start button.
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.all(20),
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                    boxShadow: [
                      BoxShadow(
                        color: Color(0x1A000000),
                        blurRadius: 12,
                        offset: Offset(0, -4),
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Drag handle.
                      Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: const Color(0xFFE2E8F0),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Conditional content — active trip card OR start prompt.
                      if (tripActive) ...[
                        _ActiveTripCard(
                          trip: tripState.trip,
                          onViewTrip: () {
                            final tripId = tripState.trip?.id;
                            if (tripId != null) {
                              context.push('/trip/active/$tripId');
                            }
                          },
                        ),
                      ] else ...[
                        // No active trip.
                        Text(
                          'Ready to travel?',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Start monitoring your journey from as little as ₦$kTripPriceNaira',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: AppColors.darkSlate.withValues(alpha: 0.6),
                          ),
                        ),
                        const SizedBox(height: 16),

                        // Start New Trip button.
                        SizedBox(
                          width: double.infinity,
                          height: 52,
                          child: FilledButton.icon(
                            onPressed: () => context.push(AppRoutes.tripRegistration),
                            icon: const Icon(Icons.play_arrow),
                            label: const Text('Start New Trip'),
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.safetyGreen,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                          ),
                        ),
                      ],

                      const SizedBox(height: 12),

                      // Quick actions row.
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () => _centerOnUser(),
                              icon: const Icon(Icons.my_location, size: 16),
                              label: const Text('My Location'),
                              style: OutlinedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(vertical: 10),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () => context.push(AppRoutes.scheduledTrips),
                              icon: const Icon(Icons.calendar_month_outlined, size: 16),
                              label: const Text('Scheduled'),
                              style: OutlinedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(vertical: 10),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () => context.push(AppRoutes.incidentReport),
                              icon: const Icon(Icons.report_outlined, size: 16),
                              label: const Text('Report'),
                              style: OutlinedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(vertical: 10),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  // ─── helpers ────────────────────────────────────────────────

  Future<void> _centerOnUser() async {
    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) return;
      }
      if (permission == LocationPermission.deniedForever) return;

      final position = await getQuickPosition();
      await _animateCamera(LatLng(position.latitude, position.longitude));

      // Resume auto-following the user's live location from here on.
      _followUser = true;
      if (_positionSubscription == null) {
        unawaited(_startTrackingUserLocation());
      }
    } catch (_) {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private widgets
// ─────────────────────────────────────────────────────────────────────────────

/// Animated "LIVE" badge shown in the top-right corner of the map whenever
/// a trip is active. The outer ring pulses to draw the eye without being
/// intrusive.
class _LiveTripBadge extends StatefulWidget {
  const _LiveTripBadge();

  @override
  State<_LiveTripBadge> createState() => _LiveTripBadgeState();
}

class _LiveTripBadgeState extends State<_LiveTripBadge>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _pulse;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);

    _pulse = Tween<double>(begin: 0.6, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) {
        return Stack(
          alignment: Alignment.center,
          children: [
            // Pulsing outer ring.
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.safetyGreen.withValues(alpha: _pulse.value * 0.25),
              ),
            ),
            // Solid badge pill.
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.safetyGreen,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.safetyGreen.withValues(alpha: 0.4),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.circle, size: 8, color: Colors.white),
                  SizedBox(width: 4),
                  Text(
                    'LIVE',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8,
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Bottom-sheet card shown in place of the "Ready to travel?" prompt when
/// a trip is currently active. Displays route summary and a "View Trip"
/// button that returns the user to the active trip screen.
class _ActiveTripCard extends StatelessWidget {
  final TripDetail? trip;
  final VoidCallback onViewTrip;

  const _ActiveTripCard({required this.trip, required this.onViewTrip});

  @override
  Widget build(BuildContext context) {
    final originName = trip?.origin['name'] as String? ?? 'Origin';
    final destName = trip?.destination['name'] as String? ?? 'Destination';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.safetyGreen.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: AppColors.safetyGreen.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Status dot.
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.safetyGreen,
              boxShadow: [
                BoxShadow(
                  color: AppColors.safetyGreen.withValues(alpha: 0.5),
                  blurRadius: 6,
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Trip in progress',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: AppColors.safetyGreen,
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 2),
                Text(
                  '$originName → $destName',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppColors.darkSlate.withValues(alpha: 0.7),
                      ),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: onViewTrip,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.safetyGreen,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: const Text(
              'View Trip',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
