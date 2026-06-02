/// SafePass Mobile App — Entry Point
///
/// Bootstraps Firebase, initializes API client, and launches the app with
/// BLoC state management and go_router declarative routing.

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

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  // Initialize API client
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
      ],
      child: MaterialApp.router(
        title: 'SafePass',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.lightTheme,
        routerConfig: createRouter(),
      ),
    );
  }
}
