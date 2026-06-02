/// Home Shell — Bottom navigation scaffold for authenticated users.
///
/// Provides a persistent bottom navigation bar with tabs:
/// Home (Map), Trips, Wallet, Profile.
/// The panic button (emergency red FAB) is always visible during an active trip.
library home_shell;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme.dart';
import '../../../app/router.dart';

class HomeShell extends StatelessWidget {
  final Widget child;

  const HomeShell({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    // Determine current tab index from location
    final location = GoRouterState.of(context).uri.toString();
    final currentIndex = _getTabIndex(location);

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: currentIndex,
        onDestinationSelected: (index) => _onTabSelected(context, index),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.map_outlined),
            selectedIcon: Icon(Icons.map),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.route_outlined),
            selectedIcon: Icon(Icons.route),
            label: 'Trips',
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
      // Panic button — always visible during active trip
      // floatingActionButton: _buildPanicButton(context),
      // floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
    );
  }

  int _getTabIndex(String location) {
    if (location.startsWith(AppRoutes.home)) return 0;
    if (location.startsWith('/trips')) return 1;
    if (location.startsWith('/wallet')) return 2;
    if (location.startsWith(AppRoutes.profile)) return 3;
    return 0;
  }

  void _onTabSelected(BuildContext context, int index) {
    switch (index) {
      case 0:
        context.go(AppRoutes.home);
        break;
      case 1:
        // TODO: Navigate to trip history
        break;
      case 2:
        // TODO: Navigate to wallet
        break;
      case 3:
        context.go(AppRoutes.profile);
        break;
    }
  }

  /// Builds the emergency panic button FAB.
  /// Only shown during active trips.
  Widget _buildPanicButton(BuildContext context) {
    // TODO: Check if trip is active
    const isTripActive = false;

    if (!isTripActive) return const SizedBox.shrink();

    return GestureDetector(
      onLongPress: () {
        // Trigger panic — requires long press to prevent accidental activation
        // TODO: Implement panic trigger via EmergencyCubit
      },
      child: Container(
        width: 64,
        height: 64,
        decoration: const BoxDecoration(
          color: AppColors.emergencyRed,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: Color(0x40D93025),
              blurRadius: 12,
              offset: Offset(0, 4),
            ),
          ],
        ),
        child: const Icon(Icons.warning_rounded, color: Colors.white, size: 32),
      ),
    );
  }
}
