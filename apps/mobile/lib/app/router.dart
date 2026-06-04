/// SafePass — Declarative Routing with go_router
///
/// All navigation happens through typed GoRoute definitions here.
/// Never use Navigator.push directly.
///
/// The router accepts an [AuthCubit] so it can react to auth state changes
/// and automatically redirect unauthenticated users to the login screen.
library safepass_router;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../features/auth/cubit/auth_cubit.dart';
import '../features/auth/screens/login_screen.dart';
import '../features/auth/screens/onboarding_screen.dart';
import '../features/auth/screens/phone_auth_screen.dart';
import '../features/home/screens/home_shell.dart';
import '../features/home/screens/home_screen.dart';
import '../features/profile/screens/profile_screen.dart';
import '../features/vehicles/screens/vehicle_list_screen.dart';
import '../features/vehicles/screens/add_vehicle_screen.dart';
import '../features/trips/screens/trip_registration_screen.dart';
import '../features/wallet/screens/wallet_screen.dart';

/// Route path constants.
class AppRoutes {
  AppRoutes._();

  static const String login = '/login';
  static const String onboarding = '/onboarding';
  static const String home = '/home';
  static const String profile = '/profile';
  static const String vehicles = '/vehicles';
  static const String addVehicle = '/vehicles/add';
  static const String phoneAuth = '/phone-auth';

  // Future routes (Week 2+)
  static const String tripRegistration = '/trip/register';
  static const String activeTrip = '/trip/active';
  static const String wallet = '/wallet';
  static const String tripHistory = '/trips';
}

/// Paths that are accessible without authentication.
const _publicPaths = {AppRoutes.login, AppRoutes.onboarding, AppRoutes.phoneAuth};

/// Bridges a [Cubit]'s stream to a [Listenable] for use with GoRouter's
/// [GoRouterRefreshStream].
///
/// GoRouter v17 expects a `Listenable` for `refreshListenable`, but
/// `flutter_bloc`'s `Cubit` uses streams internally. This adapter
/// listens to the cubit stream and calls `notifyListeners()` on every
/// state change so the router re-evaluates its redirect guard.
class _CubitChangeNotifier extends ChangeNotifier {
  late final StreamSubscription<AuthState> _subscription;

  _CubitChangeNotifier(AuthCubit cubit) {
    _subscription = cubit.stream.listen((_) => notifyListeners());
  }

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}

/// Creates the GoRouter instance with auth-aware redirects.
///
/// [authCubit] is bridged to a [Listenable] via [_CubitChangeNotifier]
/// so the router re-evaluates its [redirect] whenever the auth state
/// changes (sign-in, sign-out, token expiry, etc.).
GoRouter createRouter(AuthCubit authCubit) {
  final refreshNotifier = _CubitChangeNotifier(authCubit);

  return GoRouter(
    initialLocation: AppRoutes.login,
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final authState = authCubit.state;
      final currentPath = state.uri.toString();
      final isAuthenticated =
          authState.status == AuthStatus.authenticated ||
          authState.status == AuthStatus.onboardingRequired;
      final isPublic = _publicPaths.contains(currentPath);

      // Signed out on a protected page → force to login
      if (!isAuthenticated && !isPublic) {
        return AppRoutes.login;
      }

      // Signed in on a public page → forward to appropriate screen
      if (isAuthenticated && isPublic) {
        if (authState.status == AuthStatus.onboardingRequired &&
            currentPath != AppRoutes.onboarding) {
          return AppRoutes.onboarding;
        }
        if (authState.status == AuthStatus.authenticated) {
          return AppRoutes.home;
        }
      }

      // Allowed — no redirect
      return null;
    },
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
      GoRoute(
        path: AppRoutes.phoneAuth,
        name: 'phoneAuth',
        builder: (context, state) => const PhoneAuthScreen(),
      ),
      ShellRoute(
        builder: (context, state, child) => HomeShell(child: child),
        routes: [
          GoRoute(
            path: AppRoutes.home,
            name: 'home',
            builder: (context, state) => const HomeScreen(),
          ),
          GoRoute(
            path: AppRoutes.tripRegistration,
            name: 'tripRegistration',
            builder: (context, state) => const TripRegistrationScreen(),
          ),
          GoRoute(
            path: AppRoutes.wallet,
            name: 'wallet',
            builder: (context, state) => const WalletScreen(),
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
