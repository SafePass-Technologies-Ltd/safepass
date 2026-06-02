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
