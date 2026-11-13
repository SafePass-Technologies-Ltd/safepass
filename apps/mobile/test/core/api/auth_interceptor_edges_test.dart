/// Adversarial coverage for the three latent bugs the C-002 r2 slice claims to
/// have fixed, plus the one claim in that slice nobody tests.
///
/// The happy-path suite next door proves the classification; this file attacks
/// the edges, because each of these bugs was a *loop* or a *destructive side
/// effect* rather than a wrong status code:
///
///  1. A 401 from `/v1/auth/refresh` itself must not re-enter the interceptor.
///     Every 401 on the refresh call would start another refresh, forever.
///  2. Discarding a dead session must delete ONLY the two token keys. The old
///     `deleteAll()` also erased `fcm_token` (push registration) and
///     `active_trip_id` (crash-resume of an active trip) — so a routine expired
///     session silently stopped emergency-trip resume from working.
///  3. An unauthenticated 401 (token exchange, leads, verify pages) must not
///     rotate tokens. Refreshing there cannot fix the call and turns a sign-in
///     failure into a token rotation against a server that is already refusing.
///  4. Once a refresh run has finished, the single-flight slot must be empty
///     again. A run that is never cleared would pin every later request to a
///     finished future, so the session could never recover after an outage.
library;

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:safepass_mobile/core/api/api_client.dart';

import '../../helpers/api_test_helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late ScriptedAdapter adapter;
  late Map<String, String> storageData;
  late Dio dio;

  // One backoff delay: two attempts per refresh run, short enough to be quick
  // and long enough to prove the retry actually happened.
  const oneRetry = [Duration(milliseconds: 1)];

  setUp(() {
    storageData = {
      'access_token': 'expired-access',
      'refresh_token': 'dead-refresh',
      'fcm_token': 'device-fcm-token',
      'active_trip_id': 'trip-9f2c',
    };
    final storage = installMemorySecureStorage(storageData);
    ApiClient.instance.initialize(
      baseUrl: 'http://api.test.local',
      secureStorage: storage,
      refreshRetryDelays: oneRetry,
    );
    dio = ApiClient.instance.dio;
  });

  group('bug 1: a 401 from the refresh endpoint cannot recurse', () {
    test('refresh answers 401 to a request that carried a token: one refresh, no loop',
        () async {
      adapter = ScriptedAdapter((options) {
        // BOTH the original call and the refresh call answer 401. Without the
        // refresh-request marker this is an infinite recursion, not a failure:
        // each 401 on /v1/auth/refresh would start another refresh.
        return Future.value(respondJson(401, body: {}));
      });
      dio.httpClientAdapter = adapter;

      await expectLater(
        dio.get('/v1/trips'),
        throwsA(isA<DioException>()
            .having((e) => e.response?.statusCode, 'status', 401)),
      );

      expect(adapter.refreshCallCount, 1,
          reason: 'the refresh call answered 401 and must NOT have started a '
              'second refresh (that is the unbounded-recursion bug)');
      expect(adapter.requestLog, ['GET /v1/trips', 'POST /v1/auth/refresh'],
          reason: 'no retry of the original request either: the session is dead');
    });

    test('a refresh 401 while the refresh endpoint keeps 401ing terminates',
        () async {
      // Same shape with a body that looks like the frozen C-002 error envelope.
      adapter = ScriptedAdapter((options) {
        return Future.value(respondJson(401, body: {
          'error': {'code': 401, 'message': 'Invalid or expired refresh token'},
        }));
      });
      dio.httpClientAdapter = adapter;

      await expectLater(dio.get('/v1/trips'), throwsA(isA<DioException>()));

      expect(adapter.refreshCallCount, 1);
      // Nothing may survive that could retry later: the token keys are gone.
      expect(storageData.containsKey('access_token'), isFalse);
      expect(storageData.containsKey('refresh_token'), isFalse);
    });
  });

  group('bug 2: discarding a session deletes only the session', () {
    test('a dead session keeps fcm_token and active_trip_id', () async {
      adapter = ScriptedAdapter((options) async {
        if (options.uri.path.endsWith('/v1/auth/refresh')) {
          return respondJson(401, body: {});
        }
        return respondJson(401, body: {});
      });
      dio.httpClientAdapter = adapter;

      await expectLater(dio.get('/v1/trips'), throwsA(isA<DioException>()));

      expect(storageData.containsKey('access_token'), isFalse,
          reason: 'a 401 is the one verdict that ends the session');
      expect(storageData.containsKey('refresh_token'), isFalse);
      expect(storageData['fcm_token'], 'device-fcm-token',
          reason: 'wiping the FCM token silently disables push for the device '
              'until the next full sign-in');
      expect(storageData['active_trip_id'], 'trip-9f2c',
          reason: 'wiping the active trip id disables crash-resume of a trip '
              'that may still be running (the old deleteAll() bug)');
    });

    test('a degraded (5xx) refresh touches nothing at all', () async {
      adapter = ScriptedAdapter((options) async {
        if (options.uri.path.endsWith('/v1/auth/refresh')) {
          return respondJson(503, body: {});
        }
        return respondJson(401, body: {});
      });
      dio.httpClientAdapter = adapter;

      await expectLater(dio.get('/v1/trips'), throwsA(isA<DioException>()));

      expect(
        storageData,
        {
          'access_token': 'expired-access',
          'refresh_token': 'dead-refresh',
          'fcm_token': 'device-fcm-token',
          'active_trip_id': 'trip-9f2c',
        },
        reason: 'an infrastructure fault must leave the stored session byte '
            'for byte as it was',
      );
    });
  });

  group('bug 3: unauthenticated 401s', () {
    test('token exchange 401 on a signed-out device never refreshes', () async {
      storageData.clear();
      adapter = ScriptedAdapter((options) async => respondJson(401, body: {}));
      dio.httpClientAdapter = adapter;

      await expectLater(
        dio.post('/v1/auth/token-exchange',
            data: {'firebaseIdToken': 'stale-firebase-token'}),
        throwsA(isA<DioException>()),
      );

      expect(adapter.refreshCallCount, 0);
      expect(storageData, isEmpty,
          reason: 'nothing may be written by a failed unauthenticated call');
    });

    test('KNOWN GAP: a public 401 WITH a stale session on disk still rotates',
        () async {
      // CHARACTERIZATION, NOT APPROVAL (reported to the tech lead as LOW).
      //
      // The guard is "did this request carry an Authorization header?", not
      // "is this a route a refresh can rescue?". The interceptor attaches the
      // bearer to every request, so a public 401 while a session sits on disk
      // (re-authentication, account switch, a public verify page) still runs a
      // full refresh run and rotates both tokens for a call that a refresh
      // cannot fix. There is no refresh-token revocation list, so this is
      // wasted work and a possible extra `sessionInvalidated` emit -- not a
      // security hole. Pinned so a fix shows up as a deliberate change.
      adapter = ScriptedAdapter((options) async {
        if (options.uri.path.endsWith('/v1/auth/refresh')) {
          return respondJson(200, body: {
            'accessToken': 'rotated-access',
            'refreshToken': 'rotated-refresh',
          });
        }
        return respondJson(401, body: {});
      });
      dio.httpClientAdapter = adapter;

      await expectLater(
        dio.post('/v1/auth/token-exchange',
            data: {'firebaseIdToken': 'a-token-the-server-rejected'}),
        throwsA(isA<DioException>()),
      );

      expect(adapter.refreshCallCount, 1);
      expect(storageData['access_token'], 'rotated-access',
          reason: 'current behaviour: the tokens were rotated anyway');
    });

    test('a request that already retried cannot start a second refresh', () async {
      adapter = ScriptedAdapter((options) async {
        if (options.uri.path.endsWith('/v1/auth/refresh')) {
          return respondJson(200, body: {
            'accessToken': 'new-access',
            'refreshToken': 'new-refresh',
          });
        }
        return respondJson(401, body: {});
      });
      dio.httpClientAdapter = adapter;

      await expectLater(dio.get('/v1/trips'), throwsA(isA<DioException>()));

      expect(adapter.refreshCallCount, 1);
      expect(adapter.requestLog.where((r) => r.contains('/v1/trips')).length, 2,
          reason: 'exactly one transparent retry on the fresh token');
    });
  });

  group('the single-flight slot is released after every outcome', () {
    test('a session recovers on the NEXT request after retries were exhausted',
        () async {
      var refreshAttempts = 0;
      adapter = ScriptedAdapter((options) {
        if (options.uri.path.endsWith('/v1/auth/refresh')) {
          refreshAttempts += 1;
          // Two attempts (initial + one retry) fail, then the backend is back.
          if (refreshAttempts <= 2) return Future.value(respondJson(500, body: {}));
          return Future.value(respondJson(200, body: {
            'accessToken': 'fresh-access',
            'refreshToken': 'fresh-refresh',
          }));
        }
        if (options.headers['Authorization'] == 'Bearer fresh-access') {
          return Future.value(respondJson(200, body: {'ok': true}));
        }
        return Future.value(respondJson(401, body: {}));
      });
      dio.httpClientAdapter = adapter;

      // First request: degraded, token kept.
      await expectLater(dio.get('/v1/trips'), throwsA(isA<DioException>()));
      expect(storageData['access_token'], 'expired-access');

      // Second request: the outage is over. A single-flight future that was
      // never cleared would return the FINISHED degraded result here, and the
      // app would stay broken until restart.
      final response = await dio.get('/v1/trips');

      expect(response.statusCode, 200,
          reason: 'the next request must run a NEW refresh run');
      expect(storageData['access_token'], 'fresh-access');
      expect(refreshAttempts, 3);
    });

    test('a recovered session reads as recovered, not degraded', () async {
      var refreshAttempts = 0;
      adapter = ScriptedAdapter((options) {
        if (options.uri.path.endsWith('/v1/auth/refresh')) {
          refreshAttempts += 1;
          if (refreshAttempts <= 2) return Future.value(respondJson(500, body: {}));
          return Future.value(respondJson(200, body: {
            'accessToken': 'fresh-access',
            'refreshToken': 'fresh-refresh',
          }));
        }
        if (options.headers['Authorization'] == 'Bearer fresh-access') {
          return Future.value(respondJson(200, body: {'ok': true}));
        }
        return Future.value(respondJson(401, body: {}));
      });
      dio.httpClientAdapter = adapter;

      final events = <AuthClientEvent>[];
      final sub = ApiClient.instance.authEvents.listen(events.add);

      // First request: both attempts of the run fail, so the session degrades.
      await expectLater(dio.get('/v1/trips'), throwsA(isA<DioException>()));
      // Second request: the backend is back, and the refresh succeeds.
      await dio.get('/v1/trips');

      await pumpEventQueue();
      await sub.cancel();

      expect(events, contains(AuthClientEvent.refreshDegraded));
      expect(events, contains(AuthClientEvent.refreshRecovered),
          reason: 'the shell clears its "connection trouble" strip on this');
      expect(events, isNot(contains(AuthClientEvent.sessionInvalidated)));
    });
  });
}
