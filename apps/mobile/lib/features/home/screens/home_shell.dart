/// Home Shell — Bottom navigation scaffold for authenticated users.
///
/// Provides a persistent bottom navigation bar with tabs:
/// Home (Map), Trips, Wallet, Profile.
///
/// Panic button (emergency red FAB) will be added in Week 2-3
/// once trip state tracking is implemented (M-09, M-10).

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
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
        // TODO: Navigate to trip history (M-15, Week 4)
        break;
      case 2:
        // TODO: Navigate to wallet (M-04, Week 2)
        break;
      case 3:
        context.go(AppRoutes.profile);
        break;
    }
  }
}
