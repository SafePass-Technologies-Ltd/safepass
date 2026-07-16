part of 'delete_account_cubit.dart';

enum DeleteAccountStatus {
  initial,
  submitting,
  success,
  // Edge cases 1/2/3 from features.md M-38 (active trip / sole org admin /
  // wallet balance above threshold) -- a terminal, non-retryable-as-is block.
  preFlightBlocked,
  // Wallet balance is nonzero but at/below the forfeiture threshold -- the
  // screen should show the forfeiture checkbox and let the user retry.
  requiresWalletForfeit,
  error,
}

class DeleteAccountState extends Equatable {
  final DeleteAccountStatus status;
  final String? errorMessage;
  final bool needsReauth;
  final bool reauthAcknowledged;
  final String typedConfirmation;
  final bool forfeitWalletBalance;
  final DateTime? scheduledFor;

  const DeleteAccountState({
    this.status = DeleteAccountStatus.initial,
    this.errorMessage,
    this.needsReauth = false,
    this.reauthAcknowledged = false,
    this.typedConfirmation = '',
    this.forfeitWalletBalance = false,
    this.scheduledFor,
  });

  bool get canSubmit =>
      reauthAcknowledged &&
      typedConfirmation.trim() == 'DELETE' &&
      status != DeleteAccountStatus.submitting;

  DeleteAccountState copyWith({
    DeleteAccountStatus? status,
    String? errorMessage,
    bool? needsReauth,
    bool? reauthAcknowledged,
    String? typedConfirmation,
    bool? forfeitWalletBalance,
    DateTime? scheduledFor,
    bool clearError = false,
  }) {
    return DeleteAccountState(
      status: status ?? this.status,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      needsReauth: needsReauth ?? this.needsReauth,
      reauthAcknowledged: reauthAcknowledged ?? this.reauthAcknowledged,
      typedConfirmation: typedConfirmation ?? this.typedConfirmation,
      forfeitWalletBalance: forfeitWalletBalance ?? this.forfeitWalletBalance,
      scheduledFor: scheduledFor ?? this.scheduledFor,
    );
  }

  @override
  List<Object?> get props => [
        status,
        errorMessage,
        needsReauth,
        reauthAcknowledged,
        typedConfirmation,
        forfeitWalletBalance,
        scheduledFor,
      ];
}
