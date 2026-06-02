/// Auth Cubit — manages authentication state for the SafePass mobile app.
///
/// Handles Firebase Auth sign-in (Google, Facebook, Apple),
/// token exchange with SafePass backend, and token storage.
library auth_cubit;

import 'dart:async';
import 'package:equatable/equatable.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../../../core/api/api_client.dart';

part 'auth_state.dart';

class AuthCubit extends Cubit<AuthState> {
  AuthCubit() : super(const AuthState.initial());

  final FirebaseAuth _firebaseAuth = FirebaseAuth.instance;
  final GoogleSignIn _googleSignIn = GoogleSignIn(scopes: ['email']);

  /// Sign in with Google.
  /// 1. Trigger Google Sign-In UI
  /// 2. Get Firebase ID token
  /// 3. Exchange with SafePass backend for JWT
  Future<void> signInWithGoogle() async {
    emit(state.copyWith(status: AuthStatus.loading));

    try {
      // Trigger the Google Sign-In flow
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      if (googleUser == null) {
        // User cancelled
        emit(state.copyWith(status: AuthStatus.initial));
        return;
      }

      final GoogleSignInAuthentication googleAuth =
          await googleUser.authentication;

      // Create Firebase credential
      final credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );

      // Sign in to Firebase
      final userCredential = await _firebaseAuth.signInWithCredential(
        credential,
      );
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

      // Exchange Firebase token for SafePass JWT
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

  /// Sign in with Apple.
  Future<void> signInWithApple() async {
    emit(state.copyWith(status: AuthStatus.loading));

    try {
      // Apple Sign-In requires the sign_in_with_apple package
      // For now, emit a message that this is coming soon
      emit(
        state.copyWith(
          status: AuthStatus.error,
          errorMessage: 'Apple Sign-In will be available soon',
        ),
      );
    } catch (e) {
      emit(
        state.copyWith(
          status: AuthStatus.error,
          errorMessage: 'An unexpected error occurred',
        ),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Email & Password authentication (TEMPORARY — will be removed later).
  // ---------------------------------------------------------------------------

  /// Sign up with email and password via Firebase, then exchange token.
  Future<void> signUpWithEmailAndPassword({
    required String email,
    required String password,
  }) async {
    emit(state.copyWith(status: AuthStatus.loading));

    try {
      final userCredential =
          await _firebaseAuth.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );

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
      // Map common Firebase errors to user-friendly messages.
      final message = switch (e.code) {
        'email-already-in-use' => 'This email is already registered.',
        'invalid-email' => 'Please enter a valid email address.',
        'weak-password' => 'Password must be at least 6 characters.',
        _ => e.message ?? 'Sign-up failed',
      };
      emit(state.copyWith(status: AuthStatus.error, errorMessage: message));
    } catch (e) {
      emit(
        state.copyWith(
          status: AuthStatus.error,
          errorMessage: 'An unexpected error occurred',
        ),
      );
    }
  }

  /// Sign in with email and password via Firebase, then exchange token.
  Future<void> signInWithEmailAndPassword({
    required String email,
    required String password,
  }) async {
    emit(state.copyWith(status: AuthStatus.loading));

    try {
      final userCredential =
          await _firebaseAuth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );

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
      // Map common Firebase errors to user-friendly messages.
      final message = switch (e.code) {
        'invalid-credential' => 'Invalid email or password.',
        'user-not-found' => 'No account found with this email.',
        'wrong-password' => 'Invalid email or password.',
        'invalid-email' => 'Please enter a valid email address.',
        'too-many-requests' =>
            'Too many attempts. Please try again later or reset your password.',
        _ => e.message ?? 'Sign-in failed',
      };
      emit(state.copyWith(status: AuthStatus.error, errorMessage: message));
    } catch (e) {
      emit(
        state.copyWith(
          status: AuthStatus.error,
          errorMessage: 'An unexpected error occurred',
        ),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Social auth stubs (not yet implemented).
  // ---------------------------------------------------------------------------

  /// Sign in with Facebook.
  Future<void> signInWithFacebook() async {
    emit(state.copyWith(status: AuthStatus.loading));

    try {
      // Facebook Sign-In requires the flutter_facebook_auth package
      // For now, emit a message that this is coming soon
      emit(
        state.copyWith(
          status: AuthStatus.error,
          errorMessage: 'Facebook Sign-In will be available soon',
        ),
      );
    } catch (e) {
      emit(
        state.copyWith(
          status: AuthStatus.error,
          errorMessage: 'An unexpected error occurred',
        ),
      );
    }
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
    } on Exception catch (e) {
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
