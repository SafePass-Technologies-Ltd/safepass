/// Auth Cubit — manages authentication state for the SafePass mobile app.
///
/// Handles Firebase Auth sign-in (Google, Facebook, Apple),
/// token exchange with SafePass backend, and token storage.
library auth_cubit;

import 'package:equatable/equatable.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../../../core/api/api_client.dart';
import '../../../core/constants.dart';

part 'auth_state.dart';

class AuthCubit extends Cubit<AuthState> {
  AuthCubit() : super(const AuthState.initial());

  final FirebaseAuth _firebaseAuth = FirebaseAuth.instance;

  /// GoogleSignIn configured with serverClientId for Firebase Auth.
  ///
  /// The `serverClientId` (Web Client ID from Firebase Console →
  /// Authentication → Sign-in method → Google) is required on Android
  /// so `google_sign_in` returns an `idToken` compatible with Firebase Auth.
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: ['email'],
    serverClientId: kGoogleWebClientId,
  );

  /// Sign in with Google.
  ///
  /// 1. Trigger Google Sign-In UI
  /// 2. Get Firebase ID token
  /// 3. Exchange with SafePass backend for JWT
  Future<void> signInWithGoogle() async {
    emit(state.copyWith(status: AuthStatus.loading));

    try {
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      if (googleUser == null) {
        // User cancelled
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

  /// Sign in with Apple (stub — coming soon).
  Future<void> signInWithApple() async {
    emit(state.copyWith(status: AuthStatus.loading));
    emit(
      state.copyWith(
        status: AuthStatus.error,
        errorMessage: 'Apple Sign-In will be available soon',
      ),
    );
  }

  /// Sign in with Facebook (stub — coming soon).
  Future<void> signInWithFacebook() async {
    emit(state.copyWith(status: AuthStatus.loading));
    emit(
      state.copyWith(
        status: AuthStatus.error,
        errorMessage: 'Facebook Sign-In will be available soon',
      ),
    );
  }

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
        emit(state.copyWith(status: AuthStatus.onboardingRequired));
      } else {
        emit(state.copyWith(status: AuthStatus.authenticated));
      }
    } catch (_) {
      await _firebaseAuth.signOut();
      emit(
        state.copyWith(
          status: AuthStatus.error,
          errorMessage: 'Failed to connect to SafePass. Please try again.',
        ),
      );
    }
  }

  /// Sign out from Firebase and clear local tokens.
  Future<void> signOut() async {
    await _firebaseAuth.signOut();
    await _googleSignIn.signOut();
    await ApiClient.instance.clearTokens();
    emit(const AuthState.initial());
  }
}
