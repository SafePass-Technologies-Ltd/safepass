/// SafePass Mobile App — Entry Point
///
/// Bootstraps Firebase, initializes API client, and launches the app with
/// BLoC state management and go_router declarative routing.
///
/// On startup, the app:
///   1. Initializes the flutter_foreground_task communication port so the
///      main isolate can receive data from a running background service.
///   2. Restores the previous auth session from stored tokens.
///   3. If authenticated, checks for a persisted active trip and re-attaches
///      to the background GPS service without starting a duplicate instance.

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:safepass_mobile/firebase_options.dart';
import 'app/theme.dart';
import 'app/router.dart';
import 'core/api/api_client.dart';
import 'core/constants.dart';
import 'core/services/notification_service.dart';
import 'features/auth/cubit/auth_cubit.dart';
import 'features/profile/cubit/profile_cubit.dart';
import 'features/vehicles/cubit/vehicle_cubit.dart';
import 'features/trips/cubit/trip_registration_cubit.dart';
import 'features/trips/cubit/trip_monitoring_cubit.dart';
import 'features/wallet/cubit/wallet_cubit.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  ApiClient.instance.initialize(baseUrl: kApiBaseUrl);

  // Register the IPC port before runApp so the main isolate can receive
  // data forwarded by an already-running background trip service (e.g. after
  // the OS restarts the app while a trip is in progress).
  FlutterForegroundTask.initCommunicationPort();

  // If a background GPS service is running but there is no persisted active
  // trip, it is an orphan from a previous session. Kill it now so it does not
  // create a second Flutter engine that conflicts with geolocator in the main
  // engine (two engines → "Geolocator position updates stopped" error).
  final activeTripId = await ApiClient.instance.getActiveTripId();
  if (activeTripId == null && await FlutterForegroundTask.isRunningService) {
    await FlutterForegroundTask.stopService();
  }

  runApp(const SafePassApp());
}

/// Root widget of the SafePass mobile application.
class SafePassApp extends StatelessWidget {
  const SafePassApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>(create: (_) => AuthCubit()),
        BlocProvider<ProfileCubit>(create: (_) => ProfileCubit()),
        BlocProvider<VehicleCubit>(create: (_) => VehicleCubit()),
        BlocProvider<TripRegistrationCubit>(
          create: (_) => TripRegistrationCubit(),
        ),
        BlocProvider<TripMonitoringCubit>(
          create: (_) => TripMonitoringCubit(),
        ),
        BlocProvider<WalletCubit>(create: (_) => WalletCubit()),
      ],
      child: const _AppBody(),
    );
  }
}

/// Stateful body that kicks off session restore and trip resume after the
/// cubit tree is established.
class _AppBody extends StatefulWidget {
  const _AppBody();

  @override
  State<_AppBody> createState() => _AppBodyState();
}

class _AppBodyState extends State<_AppBody> {
  late final AuthCubit _authCubit;
  late final ProfileCubit _profileCubit;
  late final TripMonitoringCubit _tripMonitoringCubit;

  @override
  void initState() {
    super.initState();
    _authCubit = context.read<AuthCubit>();
    _profileCubit = context.read<ProfileCubit>();
    _tripMonitoringCubit = context.read<TripMonitoringCubit>();

    // Attempt to restore the previous session from stored tokens.
    // If a valid token exists, this emits AuthStatus.authenticated which
    // triggers the BlocListener below to resume any in-flight trip.
    _authCubit.restoreSession();

    // Init after Activity is ready — flutter_local_notifications needs an
    // active Activity context to register receivers before showing notifications.
    NotificationService.instance.init();
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<AuthCubit, AuthState>(
      // Trigger trip resume exactly once when the user transitions into
      // authenticated state (covers both fresh sign-in and session restore).
      listenWhen: (prev, curr) =>
          prev.status != AuthStatus.authenticated &&
          curr.status == AuthStatus.authenticated,
      listener: (context, state) {
        _tripMonitoringCubit.resumeIfActiveTrip();
      },
      child: MaterialApp.router(
        title: 'SafePass',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.lightTheme,
        routerConfig: createRouter(
          _authCubit,
          _profileCubit,
          _tripMonitoringCubit,
        ),
      ),
    );
  }
}
