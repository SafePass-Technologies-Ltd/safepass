/// SafePass Mobile App — Entry Point
///
/// Bootstraps Firebase, initializes API client, and launches the app with
/// BLoC state management and go_router declarative routing.
///
/// The GoRouter receives the AuthCubit as both a route guard (redirect)
/// and a refreshListenable so navigation reacts instantly to auth changes.

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:safepass_mobile/firebase_options.dart';
import 'app/theme.dart';
import 'app/router.dart';
import 'core/api/api_client.dart';
import 'core/constants.dart';
import 'features/auth/cubit/auth_cubit.dart';
import 'features/profile/cubit/profile_cubit.dart';
import 'features/vehicles/cubit/vehicle_cubit.dart';
import 'features/trips/cubit/trip_registration_cubit.dart';
import 'features/wallet/cubit/wallet_cubit.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  ApiClient.instance.initialize(baseUrl: kApiBaseUrl);

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
        BlocProvider<WalletCubit>(create: (_) => WalletCubit()),
      ],
      child: Builder(
        builder: (context) {
          // Read AuthCubit after it's been provided so the router can
          // use it as a refreshListenable and redirect guard.
          final authCubit = context.read<AuthCubit>();

          return MaterialApp.router(
            title: 'SafePass',
            debugShowCheckedModeBanner: false,
            theme: AppTheme.lightTheme,
            routerConfig: createRouter(authCubit),
          );
        },
      ),
    );
  }
}
