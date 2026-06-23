/// Auth Cubit — manages authentication state for the SafePass mobile app.
///
/// Handles Firebase Auth sign-in (Google, Facebook, Apple, Phone),
/// token exchange with SafePass backend, and token storage.

import 'package:equatable/equatable.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_facebook_auth/flutter_facebook_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../../../core/api/api_client.dart';
import '../../../core/constants.dart';

part 'auth_state.dart';

class AuthCubit extends Cubit<AuthState> {
  final FirebaseAuth _firebaseAuth;
  final GoogleSignIn _googleSignIn;

  /// Stored verification ID for Firebase Phone Auth OTP verification.
  /// Set by the `codeSent` callback and consumed by [verifyPhoneOtp].
  String? _phoneVerificationId;

  /// Create an AuthCubit with optional dependency injection for testing.
  ///
  /// In production, all parameters use their defaults and the Cubit
  /// connects to live Firebase Auth and Google Sign-In SDKs.
  /// In tests, pass mock/stub instances to avoid platform channel errors.
  AuthCubit({
    FirebaseAuth? firebaseAuth,
    GoogleSignIn? googleSignIn,
  })  : _firebaseAuth = firebaseAuth ?? FirebaseAuth.instance,
        _googleSignIn = googleSignIn ??
            GoogleSignIn(
              scopes: ['email'],
              serverClientId: kGoogleWebClientId,
            ),
        super(const AuthState.initial());

  // ---------------------------------------------------------------------------
  // Google Sign-In
  // ---------------------------------------------------------------------------

  /// Sign in with Google.
  Future<void> signInWithGoogle() async {
    emit(state.copyWith(status: AuthStatus.loading));

    try {
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      if (googleUser == null) {
        emit(state.copyWith(status: AuthStatus.initial));
        return;
      }

      final GoogleSignInAuthentication googleAuth =
          await googleUser.authentication;

      final credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );

      final userCredential =
          await _firebaseAuth.signInWithCredential(credential);
      final idToken = await userCredential.user?.getIdToken();

      if (idToken == null) {
        emit(
          state.copyWith(
            status: AuthStatus.error,
            errorMessage: 'Failed to get authentication token',
          ),
        );
        return;
      }

      await _exchangeToken(idToken);
    } on FirebaseAuthException catch (e) {
      emit(
        state.copyWith(
          status: AuthStatus.error,
          errorMessage: e.message ?? 'Authentication failed',
        ),
      );
    } catch (e) {
      debugPrint('Error: $e');
      emit(
        state.copyWith(
          status: AuthStatus.error,
          errorMessage: 'An unexpected error occurred',
        ),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Facebook Sign-In
  // ---------------------------------------------------------------------------

  /// Sign in with Facebook.
  ///
  /// Uses [flutter_facebook_auth] for native Facebook login, then exchanges
  /// the Facebook access token for a Firebase credential to get an ID token
  /// for SafePass token exchange.
  Future<void> signInWithFacebook() async {
    emit(state.copyWith(status: AuthStatus.loading));

    try {
      // 1. Sign in with Facebook native SDK.
      final LoginResult result = await FacebookAuth.instance.login();

      if (result.status != LoginStatus.success) {
        // User cancelled or an error occurred.
        if (result.status == LoginStatus.cancelled) {
          emit(state.copyWith(status: AuthStatus.initial));
        } else {
          emit(state.copyWith(
            status: AuthStatus.error,
            errorMessage: result.message ?? 'Facebook login failed',
          ));
        }
        return;
      }

      final accessToken = result.accessToken;
      if (accessToken == null) {
        emit(state.copyWith(
          status: AuthStatus.error,
          errorMessage: 'Failed to get Facebook access token',
        ));
        return;
      }

      // 2. Create Firebase credential from Facebook access token.
      final credential =
          FacebookAuthProvider.credential(accessToken.tokenString);

      // 3. Sign in to Firebase with Facebook credential.
      final userCredential =
          await _firebaseAuth.signInWithCredential(credential);
      final idToken = await userCredential.user?.getIdToken();

      if (idToken == null) {
        emit(state.copyWith(
          status: AuthStatus.error,
          errorMessage: 'Failed to get authentication token',
        ));
        return;
      }

      // 4. Exchange Firebase ID token for SafePass JWT.
      await _exchangeToken(idToken);
    } on FirebaseAuthException catch (e) {
      // Account exists with a different credential — account linking edge case.
      if (e.code == 'account-exists-with-different-credential') {
        emit(state.copyWith(
          status: AuthStatus.error,
          errorMessage:
              'An account already exists with this email. Please sign in with '
              'the provider you used previously.',
        ));
      } else {
        emit(state.copyWith(
          status: AuthStatus.error,
          errorMessage: e.message ?? 'Facebook authentication failed',
        ));
      }
    } catch (e) {
      debugPrint('Facebook sign-in error: $e');
      emit(state.copyWith(
        status: AuthStatus.error,
        errorMessage: 'An unexpected error occurred during Facebook sign-in',
      ));
    }
  }

  // ---------------------------------------------------------------------------
  // Phone Authentication (M-19)
  // ---------------------------------------------------------------------------

  /// Begin the phone number sign-in flow.
  ///
  /// Sends an SMS OTP via Firebase Phone Auth. On success, transitions to
  /// [AuthStatus.phoneOtpSent] so the UI can show the OTP input field.
  Future<void> startPhoneSignIn(String phoneNumber) async {
    emit(state.copyWith(
      status: AuthStatus.phoneInput,
      phoneAuthStep: PhoneAuthStep.sendingCode,
      phoneNumber: phoneNumber,
    ));

    try {
      await _firebaseAuth.verifyPhoneNumber(
        phoneNumber: phoneNumber,
        // Auto-verification (e.g., Android SMS auto-read) — rare on emulators
        verificationCompleted: (PhoneAuthCredential credential) async {
          await _completePhoneAuth(credential);
        },
        verificationFailed: (FirebaseAuthException e) {
          emit(state.copyWith(
            status: AuthStatus.error,
            errorMessage: _mapPhoneAuthError(e),
            clearPhoneAuth: true,
          ));
        },
        codeSent: (String verificationId, int? resendToken) {
          _phoneVerificationId = verificationId;
          emit(state.copyWith(
            status: AuthStatus.phoneOtpSent,
            phoneAuthStep: PhoneAuthStep.awaitingOtp,
            verificationId: verificationId,
            resendToken: resendToken,
          ));
        },
        codeAutoRetrievalTimeout: (String verificationId) {
          // SMS auto-retrieval timed out — user must enter code manually.
          // The UI already shows the OTP field; no state change needed.
          _phoneVerificationId = verificationId;
        },
      );
    } catch (e) {
      debugPrint('Phone auth error: $e');
      emit(state.copyWith(
        status: AuthStatus.error,
        errorMessage: 'Failed to send verification code. Please try again.',
        clearPhoneAuth: true,
      ));
    }
  }

  /// Verify the SMS OTP code and complete phone authentication.
  Future<void> verifyPhoneOtp(String smsCode) async {
    final verificationId = _phoneVerificationId;
    if (verificationId == null) {
      emit(state.copyWith(
        status: AuthStatus.error,
        errorMessage: 'Verification session expired. Please try again.',
        clearPhoneAuth: true,
      ));
      return;
    }

    emit(state.copyWith(
      phoneAuthStep: PhoneAuthStep.verifyingOtp,
    ));

    try {
      final credential = PhoneAuthProvider.credential(
        verificationId: verificationId,
        smsCode: smsCode,
      );
      await _completePhoneAuth(credential);
    } on FirebaseAuthException catch (e) {
      emit(state.copyWith(
        status: AuthStatus.phoneOtpSent,
        phoneAuthStep: PhoneAuthStep.awaitingOtp,
        errorMessage: _mapPhoneAuthError(e),
      ));
    } catch (e) {
      debugPrint('OTP verify error: $e');
      emit(state.copyWith(
        status: AuthStatus.error,
        errorMessage: 'An unexpected error occurred',
        clearPhoneAuth: true,
      ));
    }
  }

  /// Shared completion logic for phone auth — signs into Firebase,
  /// gets the ID token, and exchanges it with SafePass.
  ///
  /// Called by both [verificationCompleted] (auto-verify) and [verifyPhoneOtp]
  /// (manual OTP entry).
  Future<void> _completePhoneAuth(PhoneAuthCredential credential) async {
    emit(state.copyWith(
      status: AuthStatus.loading,
      phoneAuthStep: PhoneAuthStep.verifyingOtp,
    ));

    try {
      // Sign in to Firebase with the phone credential.
      // If the user doesn't exist, Firebase creates them automatically
      // (Firebase Auth creates an anonymous-like account linked to the phone).
      final userCredential =
          await _firebaseAuth.signInWithCredential(credential);
      final idToken = await userCredential.user?.getIdToken();

      if (idToken == null) {
        emit(state.copyWith(
          status: AuthStatus.error,
          errorMessage: 'Failed to get authentication token',
          clearPhoneAuth: true,
        ));
        return;
      }

      await _exchangeToken(idToken);
    } on FirebaseAuthException catch (e) {
      emit(state.copyWith(
        status: AuthStatus.error,
        errorMessage: _mapPhoneAuthError(e),
        clearPhoneAuth: true,
      ));
    }
  }

  /// Cancel the phone auth flow and return to initial state.
  void cancelPhoneSignIn() {
    _phoneVerificationId = null;
    emit(const AuthState.initial());
  }

  // ---------------------------------------------------------------------------
  // Apple (stub — requires Apple Developer account)
  // ---------------------------------------------------------------------------

  /// Sign in with Apple (stub — requires paid Apple Developer account).
  Future<void> signInWithApple() async {
    emit(state.copyWith(status: AuthStatus.loading));
    emit(
      state.copyWith(
        status: AuthStatus.error,
        errorMessage: 'Apple Sign-In will be available soon',
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Session restore
  // ---------------------------------------------------------------------------

  /// Restore a previously authenticated session from stored tokens.
  ///
  /// Called during app startup — reads the stored access token and validates
  /// it by hitting `GET /v1/users/me`. On success, emits [AuthStatus.authenticated]
  /// with the user payload. On missing token or 401, emits initial (logged-out) state.
  Future<void> restoreSession() async {
    final token = await ApiClient.instance.getAccessToken();
    if (token == null) {
      // No token stored — user has never signed in or previously signed out.
      return;
    }

    try {
      // Token is still valid if /v1/users/me returns 200.
      // The response body is available for future user-data hydration if needed.
      await ApiClient.instance.dio.get('/v1/users/me');
      emit(state.copyWith(status: AuthStatus.authenticated));
    } catch (e) {
      // 401 or network failure — treat as logged out. Clear stale token.
      await ApiClient.instance.clearTokens();
      emit(state.copyWith(status: AuthStatus.initial));
    }
  }

  // ---------------------------------------------------------------------------
  // Token exchange & sign-out
  // ---------------------------------------------------------------------------

  /// Exchange Firebase ID token for SafePass JWT tokens.
  Future<void> _exchangeToken(String firebaseIdToken) async {
    try {
      final response = await ApiClient.instance.dio.post(
        '/v1/auth/token-exchange',
        data: {'firebaseIdToken': firebaseIdToken},
      );

      final accessToken = response.data['accessToken'] as String;
      final refreshToken = response.data['refreshToken'] as String;
      final isNewUser = response.data['user']['isNew'] as bool? ?? false;

      await ApiClient.instance.saveTokens(
        accessToken: accessToken,
        refreshToken: refreshToken,
      );

      if (isNewUser) {
        emit(state.copyWith(
          status: AuthStatus.onboardingRequired,
          clearPhoneAuth: true,
        ));
      } else {
        emit(state.copyWith(
          status: AuthStatus.authenticated,
          clearPhoneAuth: true,
        ));
      }
    } catch (_) {
      await _firebaseAuth.signOut();
      emit(state.copyWith(
        status: AuthStatus.error,
        errorMessage: 'Failed to connect to SafePass. Please try again.',
        clearPhoneAuth: true,
      ));
    }
  }

  /// Sign out from all auth providers and clear local tokens.
  ///
  /// Sign-out is fire-and-forget with best-effort provider logout.
  /// Local token cleanup always happens regardless of provider errors
  /// (network issues or uninitialized Firebase in test environments
  /// must never prevent a user from clearing their session).
  Future<void> signOut() async {
    // Best-effort provider sign-out — individual failures are ignored.
    try { await _firebaseAuth.signOut(); } catch (_) {}
    try { await _googleSignIn.signOut(); } catch (_) {}
    try { await FacebookAuth.instance.logOut(); } catch (_) {}
    // Best-effort local token cleanup — should never block sign-out.
    try { await ApiClient.instance.clearTokens(); } catch (_) {}
    // Clear persisted trip ID so no stale resume happens after sign-out.
    try { await ApiClient.instance.clearActiveTripId(); } catch (_) {}
    _phoneVerificationId = null;
    emit(const AuthState.initial());
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /// Map Firebase Auth error codes to user-friendly messages for phone auth.
  String _mapPhoneAuthError(FirebaseAuthException e) {
    return switch (e.code) {
      'invalid-phone-number' => 'Please enter a valid phone number.',
      'too-many-requests' =>
        'Too many attempts. Please try again later.',
      'invalid-verification-code' =>
        'Invalid verification code. Please check and try again.',
      'session-expired' =>
        'Verification session expired. Please request a new code.',
      _ => e.message ?? 'Authentication failed',
    };
  }
}
