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
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../features/auth/cubit/auth_cubit.dart';
import '../features/auth/screens/login_screen.dart';
import '../features/auth/screens/onboarding_screen.dart';
import '../features/auth/screens/phone_auth_screen.dart';
import '../features/home/screens/home_shell.dart';
import '../features/home/screens/home_screen.dart';
import '../features/profile/cubit/profile_cubit.dart';
import '../features/profile/screens/profile_screen.dart';
import '../features/vehicles/screens/vehicle_list_screen.dart';
import '../features/vehicles/screens/add_vehicle_screen.dart';
import '../features/trips/screens/trip_registration_screen.dart';
import '../features/trips/cubit/trip_registration_cubit.dart' show PlaceLocation;
import '../features/trips/cubit/trip_monitoring_cubit.dart';
import '../features/trips/screens/active_trip_screen.dart';
import '../features/wallet/screens/wallet_screen.dart';
import '../features/emergency/screens/emergency_screen.dart';
import '../features/incidents/screens/incident_report_screen.dart';
import '../features/messaging/screens/conversations_screen.dart';
import '../features/messaging/screens/message_thread_screen.dart';
import '../features/markers/screens/marker_action_screen.dart';
import '../features/trips/screens/trip_history_screen.dart';
import '../features/trips/screens/qr_scanner_screen.dart';
import '../features/trips/screens/scheduled_trips_screen.dart';
import '../features/org/cubit/join_org_cubit.dart';
import '../features/org/screens/join_org_screen.dart';

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

  static const String tripRegistration = '/trip/register';
  static const String activeTrip = '/trip/active';
  static const String wallet = '/wallet';
  static const String tripHistory = '/trips/history';
  static const String qrScanner = '/trips/scan-qr';
  static const String scheduledTrips = '/trips/scheduled';

  static const String joinOrg = '/org/join';

  // Week 3
  static const String emergency = '/emergency/:tripId';
  static const String incidentReport = '/incidents/report';
  static const String messages = '/messages';
  static const String messageThread = '/messages/:conversationId';
  // Trip-scoped message thread — used for push notification deep links.
  static const String tripMessages = '/trips/:tripId/messages';
  static const String markerAction = '/markers/:markerId';
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
class _CubitChangeNotifier<S> extends ChangeNotifier {
  late final StreamSubscription<S> _subscription;

  _CubitChangeNotifier(Cubit<S> cubit) {
    _subscription = cubit.stream.listen((_) => notifyListeners());
  }

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}

/// Creates the GoRouter instance with auth-aware and active-trip redirects.
///
/// [authCubit] and [tripMonitoringCubit] are bridged to [Listenable]s via
/// [_CubitChangeNotifier] so the router re-evaluates its [redirect] on every
/// auth or trip state change. When the user is authenticated and has an active
/// trip the router automatically navigates to the active trip screen.
GoRouter createRouter(
  AuthCubit authCubit,
  ProfileCubit profileCubit,
  TripMonitoringCubit tripMonitoringCubit,
) {
  final refreshNotifier = Listenable.merge([
    _CubitChangeNotifier<AuthState>(authCubit),
    _CubitChangeNotifier<ProfileState>(profileCubit),
    _CubitChangeNotifier<TripMonitoringState>(tripMonitoringCubit),
  ]);

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

      // Fully authenticated user on a protected, non-profile page → make
      // sure we know whether they have an emergency contact on file, and
      // force them to the profile screen until they add one.
      if (authState.status == AuthStatus.authenticated &&
          !isPublic &&
          currentPath != AppRoutes.profile) {
        final profileState = profileCubit.state;
        if (profileState.status == ProfileStatus.initial) {
          profileCubit.loadProfile();
          return null;
        }
        if (profileState.status == ProfileStatus.loaded &&
            !profileState.hasEmergencyContact) {
          return AppRoutes.profile;
        }
      }

      // Auto-resume redirect: only fires once on cold boot (when the user lands
      // on /home after auth restores) to bring them back to an active trip.
      // Does NOT re-fire while the user navigates freely — the persistent
      // banner in HomeShell handles ongoing trip visibility.
      if (authState.status == AuthStatus.authenticated &&
          currentPath == AppRoutes.home) {
        final tripState = tripMonitoringCubit.state;
        final tripId = tripState.trip?.id;
        if (tripState.status == TripMonitorStatus.active && tripId != null) {
          return '/trip/active/$tripId';
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
            builder: (context, state) {
              // Accepts an optional PlaceLocation as extra for pre-filling
              // the destination when launched from a scheduled trip card.
              final prefill = state.extra is PlaceLocation
                  ? state.extra as PlaceLocation
                  : null;
              return TripRegistrationScreen(prefillDestination: prefill);
            },
          ),
          GoRoute(
            path: '/trip/active/:tripId',
            name: 'activeTrip',
            builder: (context, state) {
              final tripId = state.pathParameters['tripId']!;
              return ActiveTripScreen(tripId: tripId);
            },
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
          GoRoute(
            path: '/emergency/:tripId',
            name: 'emergency',
            builder: (context, state) {
              final tripId = state.pathParameters['tripId']!;
              return EmergencyScreen(tripId: tripId);
            },
          ),
          GoRoute(
            path: AppRoutes.incidentReport,
            name: 'incidentReport',
            builder: (context, state) {
              // When navigated from the active trip screen, extra carries an
              // IncidentReportArgs with the current GPS fix and trip ID so the
              // form is pre-filled without an additional Geolocator request.
              final args = state.extra is IncidentReportArgs
                  ? state.extra as IncidentReportArgs
                  : null;
              return IncidentReportScreen(args: args);
            },
          ),
          GoRoute(
            path: AppRoutes.messages,
            name: 'messages',
            builder: (context, state) => const ConversationsScreen(),
          ),
          GoRoute(
            path: '/messages/:conversationId',
            name: 'messageThread',
            builder: (context, state) {
              final conversationId = state.pathParameters['conversationId']!;
              final participantName =
                  state.uri.queryParameters['name'] ?? 'Messages';
              return MessageThreadScreen(
                tripId: conversationId,
                participantName: participantName,
              );
            },
          ),
          // Trip-scoped message route — used by push notification deep links.
          // Navigating to /trips/:tripId/messages opens the chat thread for
          // that specific trip, regardless of whether it's the active trip.
          GoRoute(
            path: '/trips/:tripId/messages',
            name: 'tripMessages',
            builder: (context, state) {
              final tripId = state.pathParameters['tripId']!;
              return MessageThreadScreen(
                tripId: tripId,
                participantName: 'Monitoring Officer',
              );
            },
          ),
          GoRoute(
            path: '/markers/:markerId',
            name: 'markerAction',
            builder: (context, state) {
              final markerId = state.pathParameters['markerId']!;
              return MarkerActionScreen(markerId: markerId);
            },
          ),
          GoRoute(
            path: AppRoutes.tripHistory,
            name: 'tripHistory',
            builder: (context, state) => const TripHistoryScreen(),
          ),
          GoRoute(
            path: AppRoutes.qrScanner,
            name: 'qrScanner',
            builder: (context, state) => const QrScannerScreen(),
          ),
          GoRoute(
            path: AppRoutes.scheduledTrips,
            name: 'scheduledTrips',
            builder: (context, state) => const ScheduledTripsScreen(),
          ),
          GoRoute(
            path: AppRoutes.joinOrg,
            name: 'joinOrg',
            // ?token=... is populated when this route is reached via an org
            // invite deep link (see main.dart's _handleIncomingLink) --
            // pre-fills and auto-submits the token instead of requiring
            // manual entry.
            builder: (context, state) => BlocProvider<JoinOrgCubit>(
              create: (_) => JoinOrgCubit(),
              child: JoinOrgScreen(initialToken: state.uri.queryParameters['token']),
            ),
          ),
        ],
      ),
    ],
  );
}
