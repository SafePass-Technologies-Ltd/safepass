/// Delete Account Cubit — M-38 Account Deletion (Screen 7a).
///
/// Drives the multi-step confirmation flow: warning -> (conditional re-auth)
/// -> typed "DELETE" confirmation -> pre-flight checks -> success. See
/// docs/SafePass/user_flow.md Flow 10a.
///
/// Re-authentication simplification: Firebase's reauthenticateWithCredential
/// flow differs per sign-in provider (Google/Facebook/Apple each need their
/// own native credential re-fetch; phone needs a fresh OTP round-trip).
/// Rather than build four separate provider-specific re-auth UIs, this cubit
/// checks `FirebaseAuth.currentUser.metadata.lastSignInTime` for recency and,
/// if stale, requires the user to sign out and sign back in before
/// continuing -- a coarser but uniform stand-in for "re-authentication
/// required" that works identically across all four providers.
library delete_account_cubit;

import 'package:dio/dio.dart';
import 'package:equatable/equatable.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/api/api_client.dart';

part 'delete_account_state.dart';

/// A sign-in is considered "recent" per Firebase reauth semantics if it
/// happened within this window -- otherwise re-authentication is required
/// before a sensitive action (account deletion) can proceed.
const _recentSignInWindow = Duration(minutes: 5);

class DeleteAccountCubit extends Cubit<DeleteAccountState> {
  DeleteAccountCubit({FirebaseAuth? firebaseAuth})
      : _firebaseAuth = firebaseAuth ?? FirebaseAuth.instance,
        super(const DeleteAccountState());

  final FirebaseAuth _firebaseAuth;
  final _dio = ApiClient.instance.dio;

  /// Step 2 of Flow 10a: determine whether re-authentication is required
  /// before the user can proceed to typed confirmation.
  void checkReauthRequirement() {
    final lastSignIn = _firebaseAuth.currentUser?.metadata.lastSignInTime;
    final needsReauth = lastSignIn == null ||
        DateTime.now().difference(lastSignIn) > _recentSignInWindow;
    emit(state.copyWith(needsReauth: needsReauth, reauthAcknowledged: !needsReauth));
  }

  /// User has been routed through sign-out + sign-back-in (the app's
  /// existing sign-in flow) and returned to continue deletion.
  void acknowledgeReauth() {
    emit(state.copyWith(reauthAcknowledged: true, needsReauth: false));
  }

  void setTypedConfirmation(String value) {
    emit(state.copyWith(typedConfirmation: value));
  }

  void setForfeitWalletBalance(bool value) {
    emit(state.copyWith(forfeitWalletBalance: value));
  }

  /// Submit the deletion request (Flow 10a: POST /v1/users/me/deletion-request).
  Future<void> submit() async {
    if (state.typedConfirmation.trim() != 'DELETE') return;

    emit(state.copyWith(status: DeleteAccountStatus.submitting, clearError: true));

    try {
      final response = await _dio.post(
        '/v1/users/me/deletion-request',
        data: {
          'confirmation': 'DELETE',
          'forfeitWalletBalance': state.forfeitWalletBalance,
        },
      );
      final data = response.data as Map<String, dynamic>;
      final scheduledFor = DateTime.tryParse(data['scheduledFor'] as String? ?? '');

      emit(state.copyWith(
        status: DeleteAccountStatus.success,
        scheduledFor: scheduledFor,
      ));
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      final message = e.response?.data?['error']?['message'] as String?;

      // A 409 with the wallet-forfeiture message means the checkbox needs to
      // be shown/checked -- surface that as a distinct state so the screen
      // can render the checkbox rather than a dead-end error.
      final requiresForfeitCheckbox =
          code == 409 && (message?.contains('forfeit') ?? false) && !state.forfeitWalletBalance;

      emit(state.copyWith(
        status: requiresForfeitCheckbox
            ? DeleteAccountStatus.requiresWalletForfeit
            : DeleteAccountStatus.preFlightBlocked,
        errorMessage: message ?? 'Failed to submit deletion request.',
      ));
    } on Exception {
      emit(state.copyWith(
        status: DeleteAccountStatus.error,
        errorMessage: 'Network error. Check your connection and try again.',
      ));
    }
  }

  void clearError() {
    emit(state.copyWith(status: DeleteAccountStatus.initial, clearError: true));
  }
}
