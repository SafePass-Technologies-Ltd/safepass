/// Active Trip Monitoring Screen — live map, GPS tracking, status,
/// speed display, and emergency panic button.
library;
///
/// Shown during an active trip. The user sees their live position on a
/// Google Map with destination marker, current speed, trip timer, and
/// a prominent panic/emergency button.
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme.dart';
import '../cubit/trip_monitoring_cubit.dart';

class ActiveTripScreen extends StatefulWidget {
  final String tripId;

  const ActiveTripScreen({super.key, required this.tripId});

  @override
  State<ActiveTripScreen> createState() => _ActiveTripScreenState();
}

class _ActiveTripScreenState extends State<ActiveTripScreen> {
  GoogleMapController? _mapController;
  final Set<Marker> _markers = {};

  @override
  void initState() {
    super.initState();
    context.read<TripMonitoringCubit>().startMonitoring(widget.tripId);
  }

  void _updateMarkers(TripMonitoringState state) {
    final trip = state.trip;
    if (trip == null) return;

    final markers = <Marker>{};

    // Current position marker (blue dot).
    if (state.lastPosition != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('current_position'),
          position: LatLng(
            state.lastPosition!.latitude,
            state.lastPosition!.longitude,
          ),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
          infoWindow: const InfoWindow(title: 'You are here'),
        ),
      );
    }

    // Destination marker.
    final dest = trip.destination;
    if (dest['latitude'] != null && dest['longitude'] != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('destination'),
          position: LatLng(
            (dest['latitude'] as num).toDouble(),
            (dest['longitude'] as num).toDouble(),
          ),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
          infoWindow: InfoWindow(
            title: dest['name'] as String? ?? 'Destination',
          ),
        ),
      );
    }

    // Origin marker.
    final origin = trip.origin;
    if (origin['latitude'] != null && origin['longitude'] != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('origin'),
          position: LatLng(
            (origin['latitude'] as num).toDouble(),
            (origin['longitude'] as num).toDouble(),
          ),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueViolet),
          infoWindow: InfoWindow(
            title: origin['name'] as String? ?? 'Origin',
          ),
        ),
      );
    }

    setState(() {
      _markers
        ..clear()
        ..addAll(markers);
    });
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<TripMonitoringCubit, TripMonitoringState>(
      listener: (context, state) {
        if (state.trip != null && state.lastPosition != null) {
          _updateMarkers(state);
        }

        // Auto-navigate camera to follow user position.
        if (state.lastPosition != null && _mapController != null) {
          _mapController!.animateCamera(
            CameraUpdate.newLatLng(
              LatLng(state.lastPosition!.latitude, state.lastPosition!.longitude),
            ),
          );
        }

        if (state.status == TripMonitorStatus.completed ||
            state.status == TripMonitorStatus.cancelled) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                state.status == TripMonitorStatus.completed
                    ? 'Trip completed — safe arrival!'
                    : 'Trip cancelled',
              ),
            ),
          );
          context.go('/home');
        }

        // Route safety alert (M-08) — non-blocking banner, dismissed after
        // display so the cubit doesn't re-emit it on the next rebuild.
        if (state.newHazardAlert != null) {
          final hazard = state.newHazardAlert!;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              behavior: SnackBarBehavior.floating,
              duration: const Duration(seconds: 6),
              backgroundColor: _hazardColor(hazard.severity),
              content: Row(
                children: [
                  const Icon(Icons.warning_amber_rounded, color: Colors.white),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      '${_hazardLabel(hazard.markerType)} ~${hazard.distanceMeters.round()}m ahead'
                      '${hazard.description != null ? ' — ${hazard.description}' : ''}',
                      style: const TextStyle(color: Colors.white),
                    ),
                  ),
                ],
              ),
            ),
          );
          context.read<TripMonitoringCubit>().dismissHazardAlert();
        }
      },
      builder: (context, state) {
        return Scaffold(
          body: Stack(
            children: [
              // ── Map ──
              _buildMap(state),

              // ── Top bar overlay ──
              Positioned(
                top: MediaQuery.of(context).padding.top + 8,
                left: 16,
                right: 16,
                child: _buildTopBar(state),
              ),

              // ── Bottom panel ──
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: _buildBottomPanel(state),
              ),
            ],
          ),
        );
      },
    );
  }

  /// Extract a [LatLng] from either a [GpsPosition] or a JSON map.
  /// Returns `null` if the position has no valid coordinates.
  LatLng? _extractLatLng(dynamic pos) {
    if (pos == null) return null;

    double? lat;
    double? lng;

    if (pos is GpsPosition) {
      lat = pos.latitude;
      lng = pos.longitude;
    } else if (pos is Map) {
      lat = (pos['latitude'] as num?)?.toDouble();
      lng = (pos['longitude'] as num?)?.toDouble();
    }

    if (lat != null && lng != null) {
      return LatLng(lat, lng);
    }
    return null;
  }

  Widget _buildMap(TripMonitoringState state) {
    // Default to user's last known position or Nigeria centre.
    final initialPos = state.lastPosition ??
        state.trip?.origin;
    final center = _extractLatLng(initialPos) ??
        const LatLng(9.0765, 7.3986);

    return GoogleMap(
      initialCameraPosition: CameraPosition(target: center, zoom: 14),
      markers: _markers,
      myLocationEnabled: true,
      myLocationButtonEnabled: false,
      zoomControlsEnabled: false,
      trafficEnabled: true,
      onMapCreated: (controller) {
        _mapController = controller;
      },
    );
  }

  Widget _buildTopBar(TripMonitoringState state) {
    return Row(
      children: [
        // Back button.
        Material(
          elevation: 2,
          shape: const CircleBorder(),
          color: Colors.white,
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: () => context.pop(),
            child: const Padding(
              padding: EdgeInsets.all(10),
              child: Icon(Icons.arrow_back, size: 20),
            ),
          ),
        ),
        const SizedBox(width: 12),
        // Status chip.
        Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: state.trip?.status == 'emergency' ||
                      state.trip?.status == 'escalated'
                  ? AppColors.emergencyRed
                  : Colors.white,
              borderRadius: BorderRadius.circular(20),
              boxShadow: const [
                BoxShadow(color: Color(0x1A000000), blurRadius: 8),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _StatusDot(status: state.trip?.status ?? 'active'),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    _statusLabel(state.trip?.status ?? 'active'),
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: state.trip?.status == 'emergency' ||
                              state.trip?.status == 'escalated'
                          ? Colors.white
                          : AppColors.darkSlate,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBottomPanel(TripMonitoringState state) {
    final trip = state.trip;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        boxShadow: [
          BoxShadow(color: Color(0x1A000000), blurRadius: 12, offset: Offset(0, -4)),
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
          const SizedBox(height: 12),

          // ── Speed + Timer row ──
          if (state.lastPosition != null)
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _InfoPill(
                  icon: Icons.speed,
                  label:
                      '${(state.lastPosition!.speed ?? 0).toStringAsFixed(0)} km/h',
                ),
                const SizedBox(width: 16),
                _InfoPill(
                  icon: Icons.timer_outlined,
                  label: trip?.startedAt != null
                      ? _formatDuration(DateTime.parse(trip!.startedAt!))
                      : '--:--',
                ),
              ],
            ),

          if (state.lastPosition != null) const SizedBox(height: 16),

          // ── Panic Button ──
          SizedBox(
            width: double.infinity,
            height: 56,
            child: FilledButton.icon(
              onPressed:
                  state.trip?.status == 'emergency' ? null : () => _triggerPanic(),
              icon: const Icon(Icons.warning_amber_rounded, size: 24),
              label: Text(
                state.trip?.status == 'emergency'
                    ? 'EMERGENCY TRIGGERED'
                    : 'EMERGENCY / PANIC',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1,
                ),
              ),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.emergencyRed,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),

          // ── Action row ──
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: state.status == TripMonitorStatus.cancelling
                      ? null
                      : () => _confirmCancel(context),
                  icon: const Icon(Icons.close, size: 18),
                  label: const Text('Cancel'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.emergencyRed,
                    side: const BorderSide(color: AppColors.emergencyRed),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: FilledButton.icon(
                  onPressed: state.status == TripMonitorStatus.completing
                      ? null
                      : () => _confirmSafeArrival(context),
                  icon: const Icon(Icons.check_circle_outline, size: 18),
                  label: const Text('Safe Arrival'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.safetyGreen,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
            ],
          ),

          // Route info.
          if (trip != null) ...[
            const SizedBox(height: 12),
            Text(
              '${trip.origin['name'] ?? 'Origin'} → ${trip.destination['name'] ?? 'Destination'}',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.darkSlate.withValues(alpha: 0.6),
                  ),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }

  void _triggerPanic() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Trigger Emergency?'),
        content: const Text(
          'This will alert SafePass monitoring officers and begin '
          'silent audio recording. Emergency contacts may be notified.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              context.read<TripMonitoringCubit>().triggerEmergency();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Emergency triggered! Help is on the way.'),
                  backgroundColor: AppColors.emergencyRed,
                ),
              );
            },
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.emergencyRed,
            ),
            child: const Text('Yes, Emergency!'),
          ),
        ],
      ),
    );
  }

  void _confirmCancel(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel Trip?'),
        content: const Text(
          'Are you sure you want to cancel this trip? Monitoring will stop.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('No'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              context.read<TripMonitoringCubit>().cancelTrip();
            },
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.emergencyRed,
            ),
            child: const Text('Yes, Cancel'),
          ),
        ],
      ),
    );
  }

  void _confirmSafeArrival(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Safe Arrival'),
        content: const Text('Confirm you have arrived safely?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Not yet'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              context.read<TripMonitoringCubit>().completeTrip();
            },
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.safetyGreen,
            ),
            child: const Text('Yes — Arrived Safely!'),
          ),
        ],
      ),
    );
  }

  /// Human-readable label for a marker type, used in hazard alert banners.
  String _hazardLabel(String markerType) => switch (markerType) {
        'kidnapping_hotspot' => 'Kidnapping hotspot',
        'checkpoint' => 'Checkpoint',
        'high_risk_zone' => 'High-risk zone',
        'recent_attack' => 'Recent attack reported',
        'safe_zone' => 'Safe zone',
        _ => 'Safety alert',
      };

  /// Banner color by severity — escalates visually with risk level.
  Color _hazardColor(String severity) => switch (severity) {
        'critical' => AppColors.emergencyRed,
        'high' => const Color(0xFFEA580C),
        'medium' => const Color(0xFFEAB308),
        _ => AppColors.darkSlate,
      };

  String _statusLabel(String status) => switch (status) {
        'active' => 'Trip Active',
        'delayed' => 'Trip Delayed',
        'emergency' => '⚠ Emergency',
        'escalated' => '⚠ Escalated',
        _ => status,
      };

  String _formatDuration(DateTime startedAt) {
    final diff = DateTime.now().difference(startedAt);
    final hours = diff.inHours;
    final minutes = diff.inMinutes.remainder(60);
    return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}';
  }
}

// ────────────────────────────────────────────────────────────
// Widgets
// ────────────────────────────────────────────────────────────

class _StatusDot extends StatelessWidget {
  final String status;

  const _StatusDot({required this.status});

  Color get _color => switch (status) {
        'active' => AppColors.safetyGreen,
        'delayed' => const Color(0xFFEAB308),
        'emergency' || 'escalated' => AppColors.emergencyRed,
        _ => const Color(0xFF9CA3AF),
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(
        color: _color,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: _color.withValues(alpha: 0.5),
            blurRadius: 4,
          ),
        ],
      ),
    );
  }
}

class _InfoPill extends StatelessWidget {
  final IconData icon;
  final String label;

  const _InfoPill({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.darkSlate.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: AppColors.darkSlate),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: AppColors.darkSlate,
                ),
          ),
        ],
      ),
    );
  }
}
