part of 'auth_cubit.dart';

/// Authentication status.
enum AuthStatus {
  /// Initial state — user not logged in
  initial,

  /// Authentication in progress
  loading,

  /// User authenticated, existing user
  authenticated,

  /// User authenticated but new — needs onboarding (ToS, emergency contacts)
  onboardingRequired,

  /// Authentication failed
  error,

  /// Phone auth — waiting for user to enter phone number
  phoneInput,

  /// Phone auth — SMS OTP sent, waiting for user to enter code
  phoneOtpSent,
}

/// Phone auth-specific status for tracking the SMS verification flow.
enum PhoneAuthStep {
  /// Idle / not in phone auth flow
  none,

  /// User entered phone number, SMS is being sent
  sendingCode,

  /// SMS OTP sent, waiting for user to enter the code
  awaitingOtp,

  /// Verifying the OTP
  verifyingOtp,
}

/// State for the AuthCubit.
class AuthState extends Equatable {
  final AuthStatus status;
  final String? errorMessage;

  // --- Phone auth fields ---
  final PhoneAuthStep phoneAuthStep;
  final String? phoneNumber;
  final String? verificationId;
  final int? resendToken;

  const AuthState({
    required this.status,
    this.errorMessage,
    this.phoneAuthStep = PhoneAuthStep.none,
    this.phoneNumber,
    this.verificationId,
    this.resendToken,
  });

  /// Initial unauthenticated state.
  const AuthState.initial()
      : status = AuthStatus.initial,
        errorMessage = null,
        phoneAuthStep = PhoneAuthStep.none,
        phoneNumber = null,
        verificationId = null,
        resendToken = null;

  /// Create a copy with optional field overrides.
  AuthState copyWith({
    AuthStatus? status,
    String? errorMessage,
    PhoneAuthStep? phoneAuthStep,
    String? phoneNumber,
    String? verificationId,
    int? resendToken,
    bool clearPhoneAuth = false,
  }) {
    return AuthState(
      status: status ?? this.status,
      errorMessage: errorMessage,
      phoneAuthStep: clearPhoneAuth
          ? PhoneAuthStep.none
          : (phoneAuthStep ?? this.phoneAuthStep),
      phoneNumber: clearPhoneAuth ? null : (phoneNumber ?? this.phoneNumber),
      verificationId: clearPhoneAuth
          ? null
          : (verificationId ?? this.verificationId),
      resendToken: clearPhoneAuth ? null : (resendToken ?? this.resendToken),
    );
  }

  @override
  List<Object?> get props => [
        status,
        errorMessage,
        phoneAuthStep,
        phoneNumber,
        verificationId,
        resendToken,
      ];
}
