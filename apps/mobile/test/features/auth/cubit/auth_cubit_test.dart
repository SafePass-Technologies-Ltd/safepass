/// Auth Cubit unit tests.
///
/// Uses `firebase_auth_mocks` to provide a fully functional mock of
/// FirebaseAuth, allowing us to test the Cubit's state machine without
/// platform channels or real credentials.
///
/// Full Firebase integration is tested via integration tests and manual QA.
library;
import 'package:bloc_test/bloc_test.dart';
import 'package:dio/dio.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:safepass_mobile/core/api/api_client.dart';
import 'package:safepass_mobile/features/auth/cubit/auth_cubit.dart';

import '../../../helpers/api_test_helpers.dart';
import '../../../helpers/firebase_test_setup.dart';

/// A test user as returned by MockFirebaseAuth after sign-in.
final _testUser = MockUser(
  isAnonymous: false,
  uid: 'test-firebase-uid',
  email: 'test@example.com',
  displayName: 'Test User',
);

void main() {
  // Initialize the API client with a dummy base URL for token exchange
  // (the actual network calls will fail — that's fine for unit tests).
  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    // The AuthCubit constructor subscribes to FirebaseMessaging streams, so a
    // (mocked) default Firebase app must exist before any test builds one.
    return setupTestFirebase().then((_) {
      // Initialize the API client with a dummy base URL for token exchange
      // (the actual network calls will fail — that's fine for unit tests).
      try {
        ApiClient.instance.initialize(baseUrl: 'http://localhost:9999');
      } catch (_) {
        // Already initialized in a previous test run.
      }
    });
  });

  // ────────────────────────────────────────────────────────────
  // Helper: build a Cubit with a signed-in mock FirebaseAuth.
  // ────────────────────────────────────────────────────────────
  AuthCubit cubitSignedIn() {
    final mockAuth = MockFirebaseAuth(signedIn: true, mockUser: _testUser);
    final cubit = AuthCubit(firebaseAuth: mockAuth);
    // Manually set authenticated state (simulating a prior token exchange).
    // In a real flow this comes from _exchangeToken, but for unit testing
    // the state machine we preset it.
    return cubit;
  }

  AuthCubit cubitSignedOut() {
    final mockAuth = MockFirebaseAuth(signedIn: false);
    return AuthCubit(firebaseAuth: mockAuth);
  }

  group('AuthCubit', () {
    // ────────────────────────────────────────────────
    // Initial state
    // ────────────────────────────────────────────────
    blocTest<AuthCubit, AuthState>(
      'initial state is AuthState.initial()',
      build: cubitSignedOut,
      verify: (cubit) {
        expect(cubit.state, const AuthState.initial());
      },
    );

    // ────────────────────────────────────────────────
    // Sign-out — clears tokens and emits initial state
    // ────────────────────────────────────────────────
    blocTest<AuthCubit, AuthState>(
      'signOut emits AuthState.initial()',
      build: cubitSignedIn,
      act: (cubit) => cubit.signOut(),
      expect: () => [const AuthState.initial()],
    );

    // ────────────────────────────────────────────────
    // Phone auth cancellation
    // ────────────────────────────────────────────────
    blocTest<AuthCubit, AuthState>(
      'cancelPhoneSignIn emits AuthState.initial()',
      build: cubitSignedOut,
      act: (cubit) => cubit.cancelPhoneSignIn(),
      expect: () => [const AuthState.initial()],
    );

    // ────────────────────────────────────────────────
    // Phone auth — verifyPhoneOtp with expired session
    // ────────────────────────────────────────────────
    blocTest<AuthCubit, AuthState>(
      'verifyPhoneOtp emits error when session expired',
      build: cubitSignedOut,
      act: (cubit) => cubit.verifyPhoneOtp('123456'),
      expect: () => [
        predicate<AuthState>(
          (s) => s.status == AuthStatus.error &&
              s.errorMessage!.contains('expired'),
        ),
      ],
    );

    // ────────────────────────────────────────────────
    // Apple sign-in stub
    // ────────────────────────────────────────────────
    blocTest<AuthCubit, AuthState>(
      'signInWithApple emits loading → error with stub message',
      build: cubitSignedOut,
      act: (cubit) => cubit.signInWithApple(),
      expect: () => [
        const AuthState(status: AuthStatus.loading),
        predicate<AuthState>(
          (s) => s.status == AuthStatus.error &&
              s.errorMessage!.contains('Apple Sign-In'),
        ),
      ],
    );
  });

  // ──────────────────────────────────────────────────────────────
  // C-002 revision 2: a dead server must never log the user out
  // ──────────────────────────────────────────────────────────────
  group('AuthCubit — C-002 r2 session survival', () {
    late ScriptedAdapter adapter;
    late Map<String, String> storageData;

    const tinyBackoff = [
      Duration(milliseconds: 1),
      Duration(milliseconds: 1),
      Duration(milliseconds: 1),
    ];

    setUp(() async {
      storageData = {
        'access_token': 'old-access',
        'refresh_token': 'old-refresh',
      };
      final storage = installMemorySecureStorage(storageData);
      ApiClient.instance.initialize(
        baseUrl: 'http://api.test.local',
        secureStorage: storage,
        refreshRetryDelays: tinyBackoff,
      );
      adapter = ScriptedAdapter((options) async {
        return respondJson(401, body: {});
      });
      ApiClient.instance.dio.httpClientAdapter = adapter;
    });

    /// Replaces the default script for the test at hand.
    void script(Future<ResponseBody> Function(RequestOptions options) handler) {
      adapter = ScriptedAdapter(handler);
      ApiClient.instance.dio.httpClientAdapter = adapter;
    }

    blocTest<AuthCubit, AuthState>(
      'restoreSession with a valid stored session emits authenticated',
      setUp: () {
        script((options) async {
          if (options.uri.path.endsWith('/v1/users/me')) {
            return respondJson(200, body: {'id': 'u1'});
          }
          // FCM re-registration fires fire-and-forget after restore.
          return respondJson(200, body: {});
        });
      },
      build: cubitSignedOut,
      act: (cubit) => cubit.restoreSession(),
      expect: () => [const AuthState(status: AuthStatus.authenticated)],
    );

    blocTest<AuthCubit, AuthState>(
      'restoreSession discards the session only when refresh answers 401',
      setUp: () {
        script((options) async => respondJson(401, body: {}));
      },
      build: cubitSignedOut,
      act: (cubit) => cubit.restoreSession(),
      expect: () => [const AuthState.initial()],
      verify: (cubit) {
        expect(storageData.containsKey('access_token'), isFalse,
            reason: 'a genuine 401 from refresh is the dead-session verdict');
        expect(storageData.containsKey('refresh_token'), isFalse);
      },
    );

    blocTest<AuthCubit, AuthState>(
      'restoreSession survives a 500 refresh: stays signed in, flags degraded',
      setUp: () {
        script((options) async => respondJson(500, body: {}));
      },
      build: cubitSignedOut,
      act: (cubit) => cubit.restoreSession(),
      expect: () => [
        predicate<AuthState>(
          (s) =>
              s.status == AuthStatus.authenticated &&
              s.isConnectionDegraded,
        ),
      ],
      verify: (cubit) {
        expect(storageData['access_token'], 'old-access',
            reason: 'a dead server must not wipe a live session');
        expect(storageData['refresh_token'], 'old-refresh');
      },
    );

    blocTest<AuthCubit, AuthState>(
      'restoreSession survives a network failure: stays signed in, flags degraded',
      setUp: () {
        script((options) async => throw networkError(options));
      },
      build: cubitSignedOut,
      act: (cubit) => cubit.restoreSession(),
      expect: () => [
        predicate<AuthState>(
          (s) =>
              s.status == AuthStatus.authenticated &&
              s.isConnectionDegraded,
        ),
      ],
      verify: (cubit) {
        expect(storageData['access_token'], 'old-access');
      },
    );

    blocTest<AuthCubit, AuthState>(
      'a later successful refresh clears the connection warning',
      setUp: () {
        // /v1/users/me and /ping answer 401; refresh answers 500 for its
        // first 4 attempts (restore) and 200 afterwards (recovery).
        script((options) async {
          if (options.uri.path.endsWith('/v1/auth/refresh')) {
            if (adapter.refreshCallCount <= 4) {
              return respondJson(500, body: {});
            }
            return respondJson(200, body: {
              'accessToken': 'new-access',
              'refreshToken': 'new-refresh',
            });
          }
          if (options.headers['Authorization'] == 'Bearer new-access') {
            return respondJson(200, body: {});
          }
          return respondJson(401, body: {});
        });
      },
      build: cubitSignedOut,
      act: (cubit) async {
        await cubit.restoreSession(); // degraded (refresh 500 ×4)
        await ApiClient.instance.dio.get('/ping'); // refresh recovers
      },
      expect: () => [
        predicate<AuthState>(
          (s) => s.status == AuthStatus.authenticated && s.isConnectionDegraded,
        ),
        predicate<AuthState>(
          (s) =>
              s.status == AuthStatus.authenticated &&
              !s.isConnectionDegraded,
        ),
      ],
    );

    blocTest<AuthCubit, AuthState>(
      'a refresh 401 while signed in routes the user back to logged-out',
      setUp: () {
        script((options) async {
          final path = options.uri.path;
          if (path.endsWith('/v1/users/me')) {
            return respondJson(200, body: {'id': 'u1'});
          }
          if (path.endsWith('/fcm-token')) {
            // The fire-and-forget FCM registration after restore must not
            // be scripted as a 401 — it carries an auth header and would
            // otherwise race /ping into the refresh path.
            return respondJson(200, body: {});
          }
          // /ping fails with an expired access token; refresh is rejected.
          return respondJson(401, body: {});
        });
      },
      build: cubitSignedOut,
      act: (cubit) async {
        await cubit.restoreSession(); // authenticated
        await expectLater(
          ApiClient.instance.dio.get('/ping'),
          throwsA(isA<DioException>()),
        );
      },
      expect: () => [
        const AuthState(status: AuthStatus.authenticated),
        const AuthState.initial(),
      ],
      verify: (cubit) {
        expect(storageData.containsKey('access_token'), isFalse);
      },
    );
  });
}
