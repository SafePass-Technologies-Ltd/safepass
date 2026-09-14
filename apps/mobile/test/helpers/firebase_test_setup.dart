/// Test-environment Firebase setup for unit tests.
///
/// Several SafePass components touch Firebase at construction time (e.g.
/// `AuthCubit._initFcmHandlers` reads `FirebaseMessaging.instance` the moment
/// it is built). Without a default `FirebaseApp`, every one of those touches
/// throws `[core/no-app]`, which is what broke the auth cubit tests.
///
/// This helper wires up the FlutterFire TEST double stack:
///   1. `setupFirebaseCoreMocks()` — the pigeon-based host API mocks that ship
///      with `firebase_core_platform_interface/test.dart`. They answer the
///      native "initializeCore/initializeApp" calls that `Firebase.initializeApp()`
///      makes on real devices, so a default app exists in the Dart VM.
///   2. A mock handler on the `plugins.flutter.io/firebase_messaging` channel —
///      `FirebaseMessaging.instance.getInitialMessage()` is an OUTBOUND
///      platform call that the AuthCubit constructor fires without an error
///      handler; without a mock it would surface as an unhandled
///      MissingPluginException and fail the tests.
///
/// Use in `setUpAll`: `await setupTestFirebase();`
///
/// Note: `Firebase.initializeApp()` is permanent for the process — a second
/// call in another test file's `setUpAll` is a no-op thanks to the try/catch.
library;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/test.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Initializes a mocked default Firebase app for the current test process.
///
/// Safe to call once per test file (usually from `setUpAll`). Re-initializing
/// an already-initialized app is intentionally swallowed: Firebase core keeps
/// its registered apps global across the test run.
Future<void> setupTestFirebase() async {
  TestWidgetsFlutterBinding.ensureInitialized();
  setupFirebaseCoreMocks();

  // The messaging plugin pushes its streams over an inbound method-call
  // handler only, but getInitialMessage() is an outbound call. Answer it with
  // an empty message map (the plugin decodes null as "no initial message" and
  // an empty map as an empty RemoteMessage — the cubit treats both as no-op).
  // Returning null instead would be read as "channel not implemented" and
  // throw MissingPluginException.
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
    const MethodChannel('plugins.flutter.io/firebase_messaging'),
    (call) async {
      switch (call.method) {
        case 'Messaging#getInitialMessage':
          return <String, dynamic>{};
        default:
          return null;
      }
    },
  );

  try {
    await Firebase.initializeApp();
  } catch (_) {
    // Default app already created earlier in the process — nothing to do.
  }
}
