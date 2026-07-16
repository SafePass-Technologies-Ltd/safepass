/// Active Trip Monitoring Screen — live map, GPS tracking, status,
/// speed display, and emergency panic button.
library;
///
/// Shown during an active trip. The user sees their live position on a
/// Google Map with destination marker, current speed, trip timer, and
/// a prominent panic/emergency button.
///
/// The emergency button requires a long press to begin a 10-second countdown
/// (see [_ActiveTripScreenState._startEmergencyCountdown]). The user can abort
/// at any time by tapping Cancel in the countdown overlay. If the countdown
/// completes, [TripMonitoringCubit.triggerEmergency] is called automatically.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:go_router/go_router.dart';
import '../../../app/router.dart' show AppRoutes;
import '../../../app/theme.dart';
import '../cubit/trip_monitoring_cubit.dart';
import '../../incidents/screens/incident_report_screen.dart' show IncidentReportArgs;
import '../../../core/services/notification_service.dart';
import '../../messaging/screens/message_thread_screen.dart';

// ─── animation constants ────────────────────────────────────────────────────
// Pulse animation duration for the "you are here" ring overlay.
const _kPulseDuration = Duration(milliseconds: 1400);

class ActiveTripScreen extends StatefulWidget {
  final String tripId;

  const ActiveTripScreen({super.key, required this.tripId});

  @override
  State<ActiveTripScreen> createState() => _ActiveTripScreenState();
}

class _ActiveTripScreenState extends State<ActiveTripScreen>
    with SingleTickerProviderStateMixin {
  GoogleMapController? _mapController;
  final Set<Marker> _markers = {};

  /// Drives the pulsing "you are here" ring on the map overlay.
  late final AnimationController _pulseController;
  late final Animation<double> _pulseAnimation;

  // ── Emergency countdown state ──────────────────────────────────────────────

  /// Periodic timer that fires once per second during the countdown.
  Timer? _emergencyCountdownTimer;

  /// Seconds remaining until the emergency is auto-triggered (10 → 0).
  int _emergencySecondsLeft = 10;

  /// Whether the countdown overlay is currently visible.
  bool _emergencyPending = false;

  /// Guards the terminal-state (completed/cancelled) snackbar + redirect so
  /// it only fires once. Without this, any later state emission while the
  /// cubit is still in a terminal status (e.g. a hazard-alert update ticking
  /// through before the '/home' navigation actually unmounts this screen)
  /// re-triggers the BlocConsumer listener, re-showing the snackbar and
  /// re-navigating — which is what caused the wrong/stale message to
  /// reappear "every time" the user landed back on this route.
  bool _terminalHandled = false;

  @override
  void initState() {
    super.initState();
    final cubit = context.read<TripMonitoringCubit>();
    // Only start monitoring if not already active (e.g. navigated here from
    // trip registration which already called startMonitoring).
    if (cubit.state.status != TripMonitorStatus.active &&
        cubit.state.status != TripMonitorStatus.gpsUpdating) {
      cubit.startMonitoring(widget.tripId);
    } else {
      // Already active (app restart resume) — seed markers immediately from
      // the current cubit state so origin/destination show before next GPS tick.
      _updateMarkers(cubit.state);
    }

    _pulseController = AnimationController(
      vsync: this,
      duration: _kPulseDuration,
    )..repeat();

    _pulseAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeOut),
    );
  }

  @override
  void dispose() {
    _emergencyCountdownTimer?.cancel();
    _pulseController.dispose();
    super.dispose();
  }

  // ── Emergency countdown logic ──────────────────────────────────────────────

  /// Shows a one-line explainer for the emergency button on a plain tap.
  ///
  /// A single tap is otherwise a harmless no-op (the real action needs a
  /// 10-second hold), so this is a safe place to teach first-time users what
  /// the button does instead of leaving them to guess or accidentally
  /// discover it.
  void _showEmergencyExplainer(BuildContext context, {required bool ended}) {
    ScaffoldMessenger.of(context).clearSnackBars();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          ended
              ? 'This journey has ended — emergency alerts are no longer available.'
              : 'Press and hold for 10 seconds to alert your emergency contacts and monitoring officer.',
        ),
        duration: const Duration(seconds: 4),
      ),
    );
  }

  /// Starts the 10-second countdown. Called on long press of the emergency
  /// button. Shows the [_EmergencyCountdownBanner] overlay immediately and
  /// calls [_fireEmergency] if the user does not cancel in time.
  void _startEmergencyCountdown() {
    setState(() {
      _emergencyPending = true;
      _emergencySecondsLeft = 10;
    });
    _emergencyCountdownTimer = Timer.periodic(
      const Duration(seconds: 1),
      (timer) {
        if (!mounted) {
          timer.cancel();
          return;
        }
        setState(() => _emergencySecondsLeft--);
        if (_emergencySecondsLeft <= 0) {
          timer.cancel();
          _fireEmergency();
        }
      },
    );
  }

  /// Aborts the in-progress countdown. The emergency is NOT triggered and the
  /// overlay is dismissed.
  void _cancelEmergencyCountdown() {
    _emergencyCountdownTimer?.cancel();
    setState(() {
      _emergencyPending = false;
      _emergencySecondsLeft = 10;
    });
  }

  /// Fires the emergency after the countdown expires. Notifies the cubit,
  /// fires a system-level local notification, shows a SnackBar, and resets
  /// countdown state.
  void _fireEmergency() {
    if (!mounted) return;
    setState(() {
      _emergencyPending = false;
      _emergencySecondsLeft = 10;
    });
    context.read<TripMonitoringCubit>().triggerEmergency();
    NotificationService.instance.showEmergencyNotification();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Emergency triggered'),
        backgroundColor: AppColors.emergencyRed,
        duration: Duration(seconds: 5),
      ),
    );
  }

  void _updateMarkers(TripMonitoringState state) {
    final trip = state.trip;
    if (trip == null) return;

    final markers = <Marker>{};

    // Origin and destination are always placed as soon as trip data exists —
    // they do not depend on a GPS position being available yet.
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

    // Current position marker added once GPS is available.
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

    // Safety markers (M-07: "active incidents, checkpoints, hotspots along
    // route. Colour-coded markers by verification level") -- the same set
    // driving the M-08 proximity alert banner (state.newHazardAlert), just
    // also drawn on the map itself instead of only interrupting via
    // snackbar. Prefixed MarkerId to avoid colliding with the fixed
    // origin/destination/current_position ids above.
    for (final hazard in state.nearbyMarkers) {
      markers.add(
        Marker(
          markerId: MarkerId('hazard_${hazard.id}'),
          position: LatLng(hazard.latitude, hazard.longitude),
          icon: BitmapDescriptor.defaultMarkerWithHue(_hazardMarkerHue(hazard.severity)),
          infoWindow: InfoWindow(
            title: _hazardLabel(hazard.markerType),
            snippet: hazard.description ?? hazard.title,
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
        if (state.trip != null) {
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

        // If the trip is already in emergency (e.g. updated from server),
        // cancel any pending countdown — no need to fire again.
        if ((state.trip?.status == 'emergency' ||
                state.trip?.status == 'escalated') &&
            _emergencyPending) {
          _cancelEmergencyCountdown();
        }

        if (!_terminalHandled &&
            (state.status == TripMonitorStatus.completed ||
                state.status == TripMonitorStatus.cancelled)) {
          _terminalHandled = true;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                state.status == TripMonitorStatus.completed
                    ? 'Journey completed — safe arrival!'
                    : 'Journey cancelled',
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

              // ── Pulsing "you are here" ring — visible while GPS is active ──
              // The map camera follows the user, so the user marker stays near the
              // vertical centre of the available map area (above the bottom panel).
              if (state.lastPosition != null)
                Positioned.fill(
                  bottom: 220, // approximate bottom panel height
                  child: Center(
                    child: _PulsingLocationRing(animation: _pulseAnimation),
                  ),
                ),

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

              // ── Emergency countdown overlay ──
              // Appears above the bottom panel when a countdown is active.
              // Sits below the top bar so the status chip remains visible.
              if (_emergencyPending)
                Positioned(
                  bottom: 0,
                  left: 0,
                  right: 0,
                  child: _EmergencyCountdownBanner(
                    secondsLeft: _emergencySecondsLeft,
                    onCancel: _cancelEmergencyCountdown,
                  ),
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
    // The top bar contains the status chip on the left and a compact Cancel
    // button on the right. No back button — the user must explicitly cancel
    // or complete the trip to leave this screen.
    final isEmergency = state.trip?.status == 'emergency' ||
        state.trip?.status == 'escalated';
    final isCancelling = state.status == TripMonitorStatus.cancelling;

    return Row(
      children: [
        // ── Status chip ──
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: isEmergency ? AppColors.emergencyRed : Colors.white,
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
              Text(
                _statusLabel(state.trip?.status ?? 'active'),
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: isEmergency ? Colors.white : AppColors.darkSlate,
                ),
              ),
            ],
          ),
        ),

        const Spacer(),

        // ── Message officer button — opens the trip's chat thread ──
        // Disabled once the trip has ended: there is no one left monitoring
        // to message, and the backend would reject the send anyway.
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: const [
              BoxShadow(color: Color(0x1A000000), blurRadius: 8),
            ],
          ),
          child: IconButton(
            onPressed: _isTripEnded(state)
                ? null
                : () {
                    final tripId = state.trip?.id ?? widget.tripId;
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => MessageThreadScreen(
                          tripId: tripId,
                          participantName: 'Monitoring Officer',
                        ),
                      ),
                    );
                  },
            icon: const Icon(Icons.chat_bubble_outline),
            color: _isTripEnded(state)
                ? AppColors.darkSlate.withValues(alpha: 0.3)
                : AppColors.primary,
            tooltip: _isTripEnded(state)
                ? 'This journey has ended'
                : 'Message officer',
            style: IconButton.styleFrom(
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              padding: const EdgeInsets.all(10),
            ),
          ),
        ),
        const SizedBox(width: 8),

        // ── Cancel button — compact, destructive, top-right ──
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: const [
              BoxShadow(color: Color(0x1A000000), blurRadius: 8),
            ],
          ),
          child: TextButton(
            onPressed: isCancelling ? null : () => _confirmCancel(context),
            style: TextButton.styleFrom(
              foregroundColor: AppColors.emergencyRed,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
                side: const BorderSide(color: AppColors.emergencyRed),
              ),
            ),
            child: Text(
              isCancelling ? 'Cancelling…' : 'Cancel',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
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

          // ── Action row: Report | Safe Arrival (primary) | Emergency icon ──
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Report — compact outlined button on the left.
              // Uses a neutral dark color so it is visually distinct from
              // the green Safe Arrival and does not compete with emergency red.
              Expanded(
                flex: 1,
                child: OutlinedButton.icon(
                  onPressed: () {
                    context.push(
                      AppRoutes.incidentReport,
                      extra: IncidentReportArgs(
                        latitude: state.lastPosition?.latitude,
                        longitude: state.lastPosition?.longitude,
                        tripId: state.trip?.id,
                      ),
                    );
                  },
                  icon: const Icon(Icons.report_outlined, size: 16),
                  label: const Text('Report'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.darkSlate,
                    side: BorderSide(
                      color: AppColors.darkSlate.withValues(alpha: 0.4),
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    textStyle: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),

              // Safe Arrival — flex 2, primary action.
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
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
              const SizedBox(width: 10),

              // Emergency — compact square icon button, long-press only.
              // A GestureDetector is used because OutlinedButton has no
              // onLongPress parameter.
              //
              // The button used to rely solely on a [Tooltip] to explain
              // itself, but tooltips need their own long-press to reveal on
              // mobile -- which collides with the real long-press action
              // (starts the 10s countdown) and so was effectively never
              // discoverable by touch. Two additions make it self-explanatory
              // without depending on that: (1) a small permanent "Hold" label
              // under the icon, matching the caption style already used by
              // the quick-action buttons elsewhere on this screen, and (2) a
              // single tap (which does nothing destructive on its own) shows
              // a snackbar spelling out exactly what holding the button does.
              //
              // Long press is disabled when:
              //   • The trip is already in emergency/escalated status.
              //   • A countdown is already in progress (_emergencyPending).
              //   • The trip has already ended (completed/cancelled) --
              //     escalating a finished trip makes no sense and the
              //     backend rejects it (see admin-emergency.routes.ts).
              Builder(builder: (_) {
                final ended = _isTripEnded(state);
                final disabled = state.trip?.status == 'emergency' ||
                    state.trip?.status == 'escalated' ||
                    _emergencyPending ||
                    ended;
                return Tooltip(
                  message:
                      ended ? 'This journey has ended' : 'Hold to trigger emergency',
                  preferBelow: false,
                  child: GestureDetector(
                    onTap: () => _showEmergencyExplainer(context, ended: ended),
                    onLongPress: disabled ? null : _startEmergencyCountdown,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: disabled
                              ? AppColors.emergencyRed.withValues(alpha: 0.4)
                              : AppColors.emergencyRed,
                        ),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.warning_amber_rounded,
                            color: disabled
                                ? AppColors.emergencyRed.withValues(alpha: 0.4)
                                : AppColors.emergencyRed,
                            size: 22,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Hold',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: disabled
                                  ? AppColors.emergencyRed.withValues(alpha: 0.4)
                                  : AppColors.emergencyRed,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
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

          // Vehicle copied disclosure banner (non-dismissible).
          if (trip != null && trip.vehicleCopiedFromInitiator) ...[
            const SizedBox(height: 10),
            _VehicleCopiedBanner(
              initiatorName: trip.vehicleSourceInitiatorName,
            ),
          ],
        ],
      ),
    );
  }

  void _confirmCancel(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel Journey?'),
        content: const Text(
          'Are you sure you want to cancel this journey? Monitoring will stop.',
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

  /// Map marker hue by severity for the M-07 safety-marker layer -- mirrors
  /// _hazardColor's escalation but constrained to BitmapDescriptor's fixed
  /// hue palette (Google Maps' default marker pins only support these
  /// preset colors, not arbitrary Color values).
  double _hazardMarkerHue(String severity) => switch (severity) {
        'critical' => BitmapDescriptor.hueRed,
        'high' => BitmapDescriptor.hueOrange,
        _ => BitmapDescriptor.hueYellow,
      };

  String _statusLabel(String status) => switch (status) {
        'active' => 'Journey Active',
        'delayed' => 'Journey Delayed',
        'emergency' => '⚠ Emergency',
        'escalated' => '⚠ Escalated',
        _ => status,
      };

  /// True once the trip has reached a terminal state (completed/cancelled).
  ///
  /// Messaging, check-in, and escalation only make sense while a trip is
  /// still being monitored -- the backend rejects these actions server-side
  /// once the trip is terminal (see message.service.ts / emergency.routes.ts),
  /// but the UI should also disable them proactively rather than let the user
  /// tap into a request that's guaranteed to fail. This mirrors the existing
  /// pattern just below for disabling the emergency button once already in
  /// emergency/escalated status.
  ///
  /// Note: the BlocConsumer listener above already navigates back to '/home'
  /// as soon as [TripMonitorStatus.completed]/[TripMonitorStatus.cancelled]
  /// is emitted, so this mainly guards the brief frame between the server
  /// confirming the status change and that navigation actually occurring.
  bool _isTripEnded(TripMonitoringState state) =>
      state.trip?.status == 'completed' || state.trip?.status == 'cancelled';

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

/// Expanding ring animation centered on the user's GPS position on the map.
///
/// Uses [animation] (0 → 1, repeating) to scale a fading ring outward from
/// a fixed center point. The ring is purely decorative — it does not interact
/// with the [GoogleMap] layer stack. Pointer events pass through (IgnorePointer).
class _PulsingLocationRing extends StatelessWidget {
  final Animation<double> animation;

  const _PulsingLocationRing({required this.animation});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: animation,
        builder: (context, _) {
          final t = animation.value;
          // Ring grows from 20px to 70px and fades out as it expands.
          final size = 20.0 + t * 50.0;
          final opacity = (1.0 - t).clamp(0.0, 1.0);

          return Center(
            child: SizedBox(
              width: size,
              height: size,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: AppColors.safetyGreen.withValues(alpha: opacity),
                    width: 3,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

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

/// Full-width red banner overlaid at the bottom of the screen while the
/// 10-second emergency countdown is active.
///
/// Shows the remaining seconds, a progress bar draining to zero, and a
/// prominent Cancel button that lets the user abort before the emergency fires.
class _EmergencyCountdownBanner extends StatelessWidget {
  /// Seconds remaining in the countdown (10 → 1).
  final int secondsLeft;

  /// Called when the user taps Cancel.
  final VoidCallback onCancel;

  const _EmergencyCountdownBanner({
    required this.secondsLeft,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    // Progress drains from 1.0 → 0.0 as secondsLeft counts down from 10 → 0.
    final progress = (secondsLeft / 10.0).clamp(0.0, 1.0);

    return Container(
      // Extend into the bottom safe-area so there is no white gap on
      // devices with a home indicator.
      padding: EdgeInsets.fromLTRB(
        20,
        20,
        20,
        20 + MediaQuery.of(context).padding.bottom,
      ),
      decoration: const BoxDecoration(
        color: AppColors.emergencyRed,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        boxShadow: [
          BoxShadow(
            color: Color(0x66000000),
            blurRadius: 16,
            offset: Offset(0, -4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // ── Drag handle (visual affordance) ──
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.4),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 16),

          // ── Large countdown digit ──
          Text(
            '$secondsLeft',
            style: const TextStyle(
              fontSize: 64,
              fontWeight: FontWeight.w900,
              color: Colors.white,
              height: 1.0,
            ),
          ),
          const SizedBox(height: 6),

          // ── Descriptive label ──
          Text(
            'Emergency triggering in $secondsLeft second${secondsLeft == 1 ? '' : 's'}…',
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),

          // ── Time-remaining progress bar (drains left → right) ──
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 6,
              backgroundColor: Colors.white.withValues(alpha: 0.25),
              valueColor: const AlwaysStoppedAnimation<Color>(Colors.white),
            ),
          ),
          const SizedBox(height: 20),

          // ── Cancel button ──
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: onCancel,
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: const BorderSide(color: Colors.white, width: 2),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                textStyle: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              child: const Text('Cancel'),
            ),
          ),
        ],
      ),
    );
  }
}

/// Non-dismissible inline banner shown when vehicle details were copied
/// from a trip tag invite initiator (M-35).
class _VehicleCopiedBanner extends StatelessWidget {
  final String? initiatorName;

  const _VehicleCopiedBanner({this.initiatorName});

  @override
  Widget build(BuildContext context) {
    final label = initiatorName != null
        ? "Vehicle details copied from $initiatorName's trip."
        : 'Vehicle details copied from journey initiator.';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        // Subtle blue-tinted info colour — distinct from error red and safe green.
        color: const Color(0xFFEFF6FF),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF93C5FD)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.info_outline,
            size: 16,
            color: Color(0xFF3B82F6),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: const Color(0xFF1E40AF),
                  ),
            ),
          ),
        ],
      ),
    );
  }
}
