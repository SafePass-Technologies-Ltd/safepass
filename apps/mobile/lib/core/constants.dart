/// SafePass — Application Constants
///
/// Every value below is read via `*.fromEnvironment`, populated at build/run
/// time via `--dart-define-from-file`. Copy `.env.example.json` to
/// `.env.json` (gitignored -- real values only ever live there, never
/// committed) in this app's root and run/build with:
///   flutter run --dart-define-from-file=.env.json
///   flutter build apk --dart-define-from-file=.env.json
library safepass_constants;

/// API base URL — override with environment-specific config.
const String kApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000', // Android emulator → host localhost
);

/// WebSocket base URL — derived from kApiBaseUrl by swapping the scheme.
/// Override with --dart-define=WS_BASE_URL=ws://... for production.
final String kWsBaseUrl = String.fromEnvironment(
  'WS_BASE_URL',
  defaultValue: kApiBaseUrl
      .replaceFirst('https://', 'wss://')
      .replaceFirst('http://', 'ws://') +
      '/v1/ws',
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

/// Facebook App ID — required by `flutter_facebook_auth`.
///
/// Find this in Meta for Developers → My Apps → App Settings → App ID.
///
/// Set via `--dart-define=FACEBOOK_APP_ID=XXXXXXXXXXXXXXX`
const String kFacebookAppId = String.fromEnvironment(
  'FACEBOOK_APP_ID',
  defaultValue: '',
);

/// Facebook Client Token — optional, used for Graph API calls.
///
/// Set via `--dart-define=FACEBOOK_CLIENT_TOKEN=XXXXXXXXXXXXXXX`
const String kFacebookClientToken = String.fromEnvironment(
  'FACEBOOK_CLIENT_TOKEN',
  defaultValue: '',
);
