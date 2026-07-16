/// Home Shell — Bottom navigation scaffold for authenticated users.
///
/// Provides a persistent bottom navigation bar with tabs:
/// Home (Map), Trips, Wallet, Profile.
///
/// Panic button (emergency red FAB) will be added in Week 2-3
/// once trip state tracking is implemented (M-09, M-10).

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geocoding/geocoding.dart';
import 'package:go_router/go_router.dart';
import '../../../app/router.dart';
import '../../../app/theme.dart';
import '../../profile/cubit/profile_cubit.dart';
import '../../trips/cubit/trip_monitoring_cubit.dart';

/// Explicit background for the bottom [NavigationBar], shared with the OS
/// system navigation bar via [AnnotatedRegion] below so the two visually
/// merge into one bar instead of Material 3's default tinted-surface color
/// (which doesn't match the system bar's default black/white) creating a
/// visible seam.
const Color _kNavBarBackground = AppColors.white;

class HomeShell extends StatefulWidget {
  final Widget child;

  const HomeShell({super.key, required this.child});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  @override
  void initState() {
    super.initState();
    final profileCubit = context.read<ProfileCubit>();
    if (profileCubit.state.status == ProfileStatus.initial) {
      profileCubit.loadProfile();
    }
  }

  @override
  Widget build(BuildContext context) {
    // Determine current tab index from location
    final location = GoRouterState.of(context).uri.toString();
    final currentIndex = _getTabIndex(location);
    final hasEmergencyContact =
        context.watch<ProfileCubit>().state.hasEmergencyContact;

    final tripState = context.watch<TripMonitoringCubit>().state;
    final tripActive = tripState.status == TripMonitorStatus.active ||
        tripState.status == TripMonitorStatus.gpsUpdating;

    // Keep the OS system navigation bar (the gesture-bar/button strip at the
    // very bottom of the screen, outside Flutter's own widget tree) in sync
    // with this shell's NavigationBar background instead of the platform
    // default black/white -- otherwise there's a visible seam between our
    // nav bar and the system bar directly beneath it.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        systemNavigationBarColor: _kNavBarBackground,
        systemNavigationBarIconBrightness: Brightness.dark,
        systemNavigationBarDividerColor: _kNavBarBackground,
      ),
      child: Scaffold(
        body: widget.child,
        // The banner and nav bar share the bottomNavigationBar slot so the banner
        // is part of the layout rather than an overlay. This ensures modal bottom
        // sheets opened from child screens are never obscured by the banner.
        bottomNavigationBar: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (tripActive) _ActiveTripBanner(tripState: tripState),
            NavigationBar(
              backgroundColor: _kNavBarBackground,
              selectedIndex: currentIndex,
              onDestinationSelected: (index) => _onTabSelected(
                context,
                index,
                currentIndex: currentIndex,
                hasEmergencyContact: hasEmergencyContact,
              ),
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.map_outlined),
                  selectedIcon: Icon(Icons.map),
                  label: 'Home',
                ),
                NavigationDestination(
                  icon: Icon(Icons.route_outlined),
                  selectedIcon: Icon(Icons.route),
                  label: 'Journeys',
                ),
                NavigationDestination(
                  icon: Icon(Icons.account_balance_wallet_outlined),
                  selectedIcon: Icon(Icons.account_balance_wallet),
                  label: 'Wallet',
                ),
                NavigationDestination(
                  icon: Icon(Icons.person_outline),
                  selectedIcon: Icon(Icons.person),
                  label: 'Profile',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  int _getTabIndex(String location) {
    if (location.startsWith(AppRoutes.home)) return 0;
    if (location.startsWith('/trip')) return 1;
    if (location.startsWith('/wallet')) return 2;
    if (location.startsWith(AppRoutes.profile)) return 3;
    return 0;
  }

  void _onTabSelected(
    BuildContext context,
    int index, {
    required int currentIndex,
    required bool hasEmergencyContact,
  }) {
    final leavingProfileTab = currentIndex == 3 && index != 3;
    if (leavingProfileTab && !hasEmergencyContact) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Please add at least one emergency contact before continuing.',
          ),
        ),
      );
      return;
    }

    switch (index) {
      case 0:
        context.go(AppRoutes.home);
        break;
      case 1:
        context.go(AppRoutes.tripRegistration);
        break;
      case 2:
        context.go(AppRoutes.wallet);
        break;
      case 3:
        context.go(AppRoutes.profile);
        break;
    }
  }
}

/// Persistent banner shown above the bottom nav on every screen while a trip
/// is active. Shows the user's current location (reverse-geocoded) and tapping
/// navigates back to the active trip screen.
class _ActiveTripBanner extends StatefulWidget {
  final TripMonitoringState tripState;

  const _ActiveTripBanner({required this.tripState});

  @override
  State<_ActiveTripBanner> createState() => _ActiveTripBannerState();
}

class _ActiveTripBannerState extends State<_ActiveTripBanner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _pulse;

  String _locationLabel = 'Locating...';
  double? _lastGeocodedLat;
  double? _lastGeocodedLng;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);
    _pulse = Tween<double>(begin: 0.5, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
    _tryReverseGeocode(widget.tripState.lastPosition);
  }

  @override
  void didUpdateWidget(_ActiveTripBanner oldWidget) {
    super.didUpdateWidget(oldWidget);
    final pos = widget.tripState.lastPosition;
    // Only re-geocode when the position has meaningfully changed (>~100m).
    if (pos != null &&
        (pos.latitude != _lastGeocodedLat ||
            pos.longitude != _lastGeocodedLng)) {
      _tryReverseGeocode(pos);
    }
  }

  Future<void> _tryReverseGeocode(GpsPosition? pos) async {
    if (pos == null) return;
    _lastGeocodedLat = pos.latitude;
    _lastGeocodedLng = pos.longitude;
    try {
      final placemarks = await placemarkFromCoordinates(
        pos.latitude,
        pos.longitude,
      );
      if (!mounted) return;
      final p = placemarks.firstOrNull;
      if (p != null) {
        final parts = [
          if (p.street?.isNotEmpty == true) p.street,
          if (p.subLocality?.isNotEmpty == true) p.subLocality,
          if (p.locality?.isNotEmpty == true) p.locality,
        ];
        setState(() {
          _locationLabel = parts.isNotEmpty ? parts.join(', ') : 'Current location';
        });
      }
    } catch (_) {
      if (mounted) setState(() => _locationLabel = 'Current location');
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tripId = widget.tripState.trip?.id;

    return GestureDetector(
      onTap: () {
        if (tripId != null) context.push('/trip/active/$tripId');
      },
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.safetyGreen,
          boxShadow: [
            BoxShadow(
              color: AppColors.safetyGreen.withValues(alpha: 0.4),
              blurRadius: 12,
              offset: const Offset(0, -2),
            ),
          ],
        ),
        child: Row(
          children: [
            AnimatedBuilder(
              animation: _pulse,
              builder: (_, __) => Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: _pulse.value),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Journey in progress',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.3,
                    ),
                  ),
                  Row(
                    children: [
                      const Icon(Icons.location_on, color: Colors.white70, size: 11),
                      const SizedBox(width: 3),
                      Expanded(
                        child: Text(
                          _locationLabel,
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 11,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: Colors.white, size: 20),
          ],
        ),
      ),
    );
  }
}
