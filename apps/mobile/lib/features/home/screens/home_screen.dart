/// Home Screen — Map view with quick actions and active trip status.
///
/// Shows a Google Map with the user's current location. If an active
/// trip is in progress, shows trip status with a "View Trip" button.
/// Otherwise, shows a "Start New Trip" call-to-action.
import 'package:flutter/material.dart';
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
  static const _defaultCenter = LatLng(9.0765, 7.3986); // Nigeria centre

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
            myLocationButtonEnabled: true,
            zoomControlsEnabled: false,
            trafficEnabled: true,
            onMapCreated: (controller) {
              _mapController = controller;
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
                    'Start monitoring your journey for ₦$kTripPriceNaira',
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

  void _centerOnUser() {
    // This would use Geolocator to get current position and animate the
    // camera. For now, zoom to Nigeria level.
    _mapController?.animateCamera(
      CameraUpdate.newLatLngZoom(_defaultCenter, 14),
    );
  }
}
