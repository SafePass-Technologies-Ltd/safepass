/// SafePass — Application Constants
library safepass_constants;

/// API base URL — override with environment-specific config.
const String kApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000', // Android emulator → host localhost
);

/// Trip pricing.
const int kTripPriceNaira = 2000;

/// Minimum wallet top-up amount.
const int kMinWalletTopUp = 2000;

/// Maximum emergency contacts.
const int kMaxEmergencyContacts = 3;

/// Maximum saved vehicles per user.
const int kMaxSavedVehicles = 5;

/// Google Sign-In Web Client ID — required by `google_sign_in` v6.x on Android
/// to obtain an `idToken` compatible with Firebase Auth.
///
/// Find this in Firebase Console → Authentication → Sign-in method → Google →
/// Web SDK configuration → "Web client ID".
///
/// Set via `--dart-define=GOOGLE_WEB_CLIENT_ID=XXXX.apps.googleusercontent.com`
const String kGoogleWebClientId = String.fromEnvironment(
  'GOOGLE_WEB_CLIENT_ID',
  defaultValue: '',
);
