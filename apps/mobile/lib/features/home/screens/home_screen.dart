/// Home Screen — Map view with quick actions and active trip status.
///
/// Shows a Google Map with the user's current location. If an active
/// trip is in progress, shows trip status with a "View Trip" button.
/// Otherwise, shows a "Start New Trip" call-to-action.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme.dart';
import '../../../app/router.dart';
import '../../../core/constants.dart';

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
  }

  Future<void> _centerOnUser() async {
    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) return;
      }
      if (permission == LocationPermission.deniedForever) return;

      final position = await Geolocator.getCurrentPosition();
      await _animateCamera(LatLng(position.latitude, position.longitude));

      // Resume auto-following the user's live location from here on.
      _followUser = true;
      if (_positionSubscription == null) {
        unawaited(_startTrackingUserLocation());
      }
    } catch (_) {}
  }
}
