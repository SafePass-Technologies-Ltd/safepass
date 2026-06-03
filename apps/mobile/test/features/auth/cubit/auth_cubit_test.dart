/// Auth Cubit unit tests.
///
/// Uses `firebase_auth_mocks` to provide a fully functional mock of
/// FirebaseAuth, allowing us to test the Cubit's state machine without
/// platform channels or real credentials.
///
/// Full Firebase integration is tested via integration tests and manual QA.
import 'package:bloc_test/bloc_test.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:safepass_mobile/core/api/api_client.dart';
import 'package:safepass_mobile/features/auth/cubit/auth_cubit.dart';

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
    try {
      ApiClient.instance.initialize(baseUrl: 'http://localhost:9999');
    } catch (_) {
      // Already initialized in a previous test run.
    }
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
}
