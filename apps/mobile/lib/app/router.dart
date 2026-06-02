/// SafePass — Declarative Routing with go_router
///
/// All navigation happens through typed GoRoute definitions here.
/// Never use Navigator.push directly.
library safepass_router;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../features/auth/screens/login_screen.dart';
import '../features/auth/screens/onboarding_screen.dart';
import '../features/home/screens/home_shell.dart';
import '../features/profile/screens/profile_screen.dart';
import '../features/vehicles/screens/vehicle_list_screen.dart';
import '../features/vehicles/screens/add_vehicle_screen.dart';

/// Route path constants.
class AppRoutes {
  AppRoutes._();

  static const String login = '/login';
  static const String onboarding = '/onboarding';
  static const String home = '/home';
  static const String profile = '/profile';
  static const String vehicles = '/vehicles';
  static const String addVehicle = '/vehicles/add';

  // Future routes (Week 2+)
  static const String tripRegistration = '/trip/register';
  static const String activeTrip = '/trip/active';
  static const String wallet = '/wallet';
  static const String tripHistory = '/trips';
}

/// Creates the GoRouter instance with all app routes.
GoRouter createRouter() {
  return GoRouter(
    initialLocation: AppRoutes.login,
    routes: [
      GoRoute(
        path: AppRoutes.login,
        name: 'login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: AppRoutes.onboarding,
        name: 'onboarding',
        builder: (context, state) => const OnboardingScreen(),
      ),
      ShellRoute(
        builder: (context, state, child) => HomeShell(child: child),
        routes: [
          GoRoute(
            path: AppRoutes.home,
            name: 'home',
            builder: (context, state) => const Center(child: Text('Home — Map View')),
          ),
          GoRoute(
            path: AppRoutes.profile,
            name: 'profile',
            builder: (context, state) => const ProfileScreen(),
          ),
          GoRoute(
            path: AppRoutes.vehicles,
            name: 'vehicles',
            builder: (context, state) => const VehicleListScreen(),
          ),
          GoRoute(
            path: AppRoutes.addVehicle,
            name: 'addVehicle',
            builder: (context, state) => const AddVehicleScreen(),
          ),
        ],
      ),
    ],
  );
}
