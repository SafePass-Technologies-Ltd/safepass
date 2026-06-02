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
}

/// State for the AuthCubit.
class AuthState extends Equatable {
  final AuthStatus status;
  final String? errorMessage;

  const AuthState({
    required this.status,
    this.errorMessage,
  });

  /// Initial unauthenticated state.
  const AuthState.initial()
      : status = AuthStatus.initial,
        errorMessage = null;

  /// Create a copy with optional field overrides.
  AuthState copyWith({
    AuthStatus? status,
    String? errorMessage,
  }) {
    return AuthState(
      status: status ?? this.status,
      errorMessage: errorMessage,
    );
  }

  @override
  List<Object?> get props => [status, errorMessage];
}
