/// Dio HTTP client with auth interceptor for SafePass API.
///
/// C-002 revision 2 (binding): `POST /v1/auth/refresh` answers `401` **only**
/// when the refresh token itself is unusable (dead session), and `5xx` (or any
/// network failure) when infrastructure is broken (a 5xx is never evidence that
/// the user is logged out). The interceptor enforces that split:
///
///   * refresh `401`  -> discard the stored session, publish
///     [AuthClientEvent.sessionInvalidated] so AuthCubit can route to sign-in.
///   * refresh `5xx` / timeout / connection error -> bounded exponential
///     backoff retries; on exhaustion the stored session is KEPT on disk and
///     [AuthClientEvent.refreshDegraded] is published (non-destructive).
///
/// Concurrent requests that hit an expired access token share ONE refresh
/// run (single-flight) so a fleet of in-flight calls cannot stampede the
/// refresh endpoint.
library;

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Marker set on `RequestOptions.extra` for the refresh call itself, so the
/// interceptor never attempts to "refresh the refresh" (which previously
/// recursed on every 401 the refresh endpoint answered).
const _kRefreshRequestMarker = 'safepass_is_refresh_request';

/// Marker set on `RequestOptions.extra` for a request that has already been
/// transparently retried once after a successful refresh. Bounds the retry so
/// a request that 401s even with a fresh token cannot loop forever.
const _kAuthRetryMarker = 'safepass_auth_retried';

/// Backoff gaps between refresh retries. Attempt 0 is the initial call, so a
/// list of N delays allows N+1 attempts total before giving up non-fatally.
const _defaultRefreshRetryDelays = [
  Duration(seconds: 1),
  Duration(seconds: 2),
  Duration(seconds: 4),
];

/// Session-health events published by [ApiClient]; AuthCubit listens and
/// translates them into user-visible state.
enum AuthClientEvent {
  /// Refresh answered 401 — the stored session has been discarded and the
  /// user must sign in again.
  sessionInvalidated,

  /// Refresh failed with 5xx/network after retries — the stored session is
  /// intact on disk; the app is signed in but connectivity is degraded.
  refreshDegraded,

  /// A refresh succeeded after a degraded period — connectivity restored.
  refreshRecovered,
}

/// Terminal classification of one single-flight refresh run.
enum RefreshOutcome {
  /// New tokens issued and persisted.
  success,

  /// Refresh answered 401 — session is dead; must be discarded.
  rejected,

  /// Infrastructure fault after retries — session must be KEPT.
  transientFailure,
}

/// Result of one single-flight refresh run.
class RefreshResult {
  final RefreshOutcome outcome;

  /// New access token — set only when [outcome] is [RefreshOutcome.success].
  final String? accessToken;

  const RefreshResult._(this.outcome, [this.accessToken]);

  const RefreshResult.success(String token)
      : this._(RefreshOutcome.success, token);

  const RefreshResult.rejected() : this._(RefreshOutcome.rejected);

  const RefreshResult.transient() : this._(RefreshOutcome.transientFailure);
}

/// Singleton Dio instance configured for SafePass API.
class ApiClient {
  ApiClient._();

  static final ApiClient _instance = ApiClient._();
  static ApiClient get instance => _instance;

  late Dio dio;
  FlutterSecureStorage _secureStorage = const FlutterSecureStorage();

  /// Broadcast stream of session-health events (see [AuthClientEvent]).
  final StreamController<AuthClientEvent> _authEvents =
      StreamController<AuthClientEvent>.broadcast();

  Stream<AuthClientEvent> get authEvents => _authEvents.stream;

  /// Initialize the Dio client with base URL and interceptors.
  ///
  /// [secureStorage] and [refreshRetryDelays] are injection points for tests.
  /// Calling again re-points the client (tests do this per scenario); the
  /// event stream is created once and survives re-initialization.
  void initialize({
    required String baseUrl,
    FlutterSecureStorage? secureStorage,
    List<Duration> refreshRetryDelays = _defaultRefreshRetryDelays,
  }) {
    _secureStorage = secureStorage ?? const FlutterSecureStorage();
    dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    dio.interceptors.add(
      AuthInterceptor(
        dio: dio,
        secureStorage: _secureStorage,
        authEvents: _authEvents,
        retryDelays: refreshRetryDelays,
      ),
    );
    dio.interceptors.add(LogInterceptor(
      requestBody: true,
      responseBody: true,
      logPrint: (obj) => debugPrint(obj.toString()),
    ));
  }

  /// Get the current access token from secure storage.
  Future<String?> getAccessToken() async {
    return _secureStorage.read(key: 'access_token');
  }

  /// Store tokens in secure storage.
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _secureStorage.write(key: 'access_token', value: accessToken);
    await _secureStorage.write(key: 'refresh_token', value: refreshToken);
  }

  /// Clear stored tokens (logout).
  Future<void> clearTokens() async {
    await _secureStorage.delete(key: 'access_token');
    await _secureStorage.delete(key: 'refresh_token');
  }

  // ---------------------------------------------------------------------------
  // Active trip persistence — used for auto-resume on app restart
  // ---------------------------------------------------------------------------

  /// Persist the active trip ID so it survives app restarts.
  Future<void> saveActiveTripId(String tripId) async {
    await _secureStorage.write(key: 'active_trip_id', value: tripId);
  }

  /// Read the persisted active trip ID, or null if none is stored.
  Future<String?> getActiveTripId() async {
    return _secureStorage.read(key: 'active_trip_id');
  }

  /// Remove the persisted active trip ID (called on trip completion/cancellation/sign-out).
  Future<void> clearActiveTripId() async {
    await _secureStorage.delete(key: 'active_trip_id');
  }
}

/// Interceptor that attaches the Bearer access token to every request and
/// enforces the C-002 r2 refresh contract on 401 responses.
class AuthInterceptor extends Interceptor {
  final Dio dio;
  final FlutterSecureStorage secureStorage;

  final StreamController<AuthClientEvent> _authEvents;

  /// Gaps between refresh retries — see [_defaultRefreshRetryDelays].
  final List<Duration> retryDelays;

  /// The single in-flight refresh run shared by all concurrent 401s.
  Future<RefreshResult>? _refreshInFlight;

  AuthInterceptor({
    required this.dio,
    required this.secureStorage,
    required StreamController<AuthClientEvent> authEvents,
    this.retryDelays = _defaultRefreshRetryDelays,
  }) : _authEvents = authEvents;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await secureStorage.read(key: 'access_token');
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;

    // The refresh call itself, and any request that has already been retried
    // once on a fresh token, must never trigger another refresh — without
    // these guards a persistent 401 recursed into this handler forever.
    if (options.extra[_kRefreshRequestMarker] == true ||
        options.extra[_kAuthRetryMarker] == true) {
      return handler.next(err);
    }

    // Only a request that CARRIED an access token can plausibly be rescued by
    // a refresh. Public routes (token-exchange, login, leads) answer 401 for
    // reasons a refresh cannot fix; refreshing on them would rotate tokens in
    // a loop while the call keeps failing.
    final carriedAuthHeader = options.headers['Authorization'] != null;

    if (err.response?.statusCode == 401 && carriedAuthHeader) {
      final result = await _refreshSession();

      switch (result.outcome) {
        case RefreshOutcome.success:
          final newAccessToken = result.accessToken!;
          _publish(AuthClientEvent.refreshRecovered);

          // Multipart/form-data bodies (e.g. emergency audio chunk uploads
          // via MultipartFile.fromFile -- see trip_monitoring_cubit.dart)
          // wrap a ONE-SHOT byte stream that's fully consumed by the first
          // send attempt. Blindly replaying `err.requestOptions` here would
          // transmit that already-drained stream -- the server still
          // returns 200/201 (nothing validates the received byte count
          // against what was intended), so the request *looks* successful,
          // but the file that actually lands on disk is silently
          // truncated/corrupted. This was traced directly to unplayable
          // emergency audio chunks: real 201 responses, real files on disk,
          // but empty/near-empty payloads.
          //
          // Skip the transparent retry for these -- the token is still
          // refreshed above, so it's available for the next attempt. The
          // caller is responsible for its own retry with a FRESH request
          // body in that case (emergency chunk uploads already do this:
          // failed chunks stay in _pendingChunkPaths and are retried by
          // re-reading the file from disk, which is only deleted on
          // confirmed success -- see _attemptEmergencyChunkUpload).
          if (options.data is FormData) {
            return handler.next(err);
          }

          // Retry the original request with the new token (safe for
          // non-streaming/JSON bodies, which CAN be replayed as-is).
          options.headers['Authorization'] = 'Bearer $newAccessToken';
          options.extra[_kAuthRetryMarker] = true;
          try {
            final retryResponse = await dio.fetch(options);
            return handler.resolve(retryResponse);
          } on DioException catch (retryErr) {
            // The retry failed on its own merits — surface that outcome
            // instead of the stale pre-refresh 401.
            return handler.next(retryErr);
          }

        case RefreshOutcome.rejected:
          // SAFETY-CRITICAL (C-002 r2): this is the ONLY refresh outcome that
          // is evidence the session is dead. Discard exactly the two token
          // keys — deliberately NOT deleteAll(), which would also wipe
          // `fcm_token` and `active_trip_id` (push registration and active-
          // trip resume must survive an auth failure) — and let AuthCubit
          // route the user to sign-in.
          await _clearSessionTokens();
          _publish(AuthClientEvent.sessionInvalidated);
          return handler.next(err);

        case RefreshOutcome.transientFailure:
          // SAFETY-CRITICAL (C-002 r2): a 5xx, timeout or connection failure
          // says NOTHING about the session. Keep the tokens on disk, surface
          // a non-destructive degradation event, and propagate the original
          // 401 so the caller sees a request failure — never a logout.
          _publish(AuthClientEvent.refreshDegraded);
          return handler.next(err);
      }
    }
    return handler.next(err);
  }

  /// Single-flight entry point: concurrent callers share one refresh run.
  Future<RefreshResult> _refreshSession() {
    final pending = _refreshInFlight;
    if (pending != null) return pending;

    final future = _doRefreshWithRetry();
    _refreshInFlight = future;
    // Clear the slot once the run settles so the NEXT expired token refreshes
    // again. The run itself never throws (it returns a classification), so
    // this cannot leave a poisoned future behind.
    unawaited(future.whenComplete(() {
      if (identical(_refreshInFlight, future)) _refreshInFlight = null;
    }));
    return future;
  }

  /// One refresh run: attempt, classify, and on infrastructure failure retry
  /// with bounded exponential backoff. Never throws — always classifies.
  Future<RefreshResult> _doRefreshWithRetry() async {
    final refreshToken = await secureStorage.read(key: 'refresh_token');
    if (refreshToken == null) {
      // Nothing to refresh with — a 401 session in this state is unrecoverable.
      return const RefreshResult.rejected();
    }

    for (var attempt = 0;; attempt++) {
      var failed = false;
      String? newAccessToken;
      String? newRefreshToken;

      try {
        final response = await dio.post(
          '/v1/auth/refresh',
          data: {'refreshToken': refreshToken},
          options: Options(extra: {_kRefreshRequestMarker: true}),
        );
        newAccessToken = response.data['accessToken'] as String?;
        newRefreshToken = response.data['refreshToken'] as String?;
        // A 2xx that doesn't carry the promised shape is a server fault, not
        // a verdict on the session — treat it like any other 5xx-class case.
        if (newAccessToken == null || newRefreshToken == null) failed = true;
      } on DioException catch (e) {
        if (e.response?.statusCode == 401) {
          // C-002 r2 — the refresh token itself is unusable (bad signature,
          // expired, user gone/inactive). Only here is the session dead.
          return const RefreshResult.rejected();
        }
        // 5xx, 429, timeout, connection error — infrastructure, retryable.
        failed = true;
      } catch (_) {
        // Malformed body or unexpected throw — not an authentication verdict.
        failed = true;
      }

      if (!failed) {
        await secureStorage.write(key: 'access_token', value: newAccessToken);
        await secureStorage.write(key: 'refresh_token', value: newRefreshToken);
        return RefreshResult.success(newAccessToken!);
      }

      if (attempt >= retryDelays.length) {
        return const RefreshResult.transient();
      }
      await Future<void>.delayed(retryDelays[attempt]);
    }
  }

  /// Remove only the session keys, never the rest of the secure store.
  Future<void> _clearSessionTokens() async {
    await secureStorage.delete(key: 'access_token');
    await secureStorage.delete(key: 'refresh_token');
  }

  /// Publish a session-health event; tolerant of teardown-time closure.
  void _publish(AuthClientEvent event) {
    if (!_authEvents.isClosed) _authEvents.add(event);
  }
}
