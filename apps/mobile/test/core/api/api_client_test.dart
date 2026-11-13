/// Tests for the auth interceptor's C-002 revision 2 contract:
///
///   * refresh 401            -> discard the session (only the token keys),
///                               emit sessionInvalidated.
///   * refresh 5xx / network  -> keep the session, retry with bounded backoff,
///                               emit refreshDegraded, never log the user out.
///   * concurrent 401s        -> share ONE refresh run (single-flight).
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

  // Short, non-zero backoff so retry counts are observable but tests stay fast.
  const tinyBackoff = [
    Duration(milliseconds: 1),
    Duration(milliseconds: 1),
    Duration(milliseconds: 1),
  ];

  setUp(() async {
    storageData = {
      'access_token': 'old-access',
      'refresh_token': 'old-refresh',
      // Proves the failure path must NOT wipe unrelated keys (the old
      // deleteAll() bug also erased fcm_token / active_trip_id).
      'fcm_token': 'fcm-123',
    };
    final storage = installMemorySecureStorage(storageData);
    ApiClient.instance.initialize(
      baseUrl: 'http://api.test.local',
      secureStorage: storage,
      refreshRetryDelays: tinyBackoff,
    );
    dio = ApiClient.instance.dio;
  });

  /// Collects session-health events published while [body] runs.
  Future<List<AuthClientEvent>> collectEvents(
    Future<void> Function() body,
  ) async {
    final events = <AuthClientEvent>[];
    final sub = ApiClient.instance.authEvents.listen(events.add);
    try {
      await body();
      await pumpEventQueue();
    } finally {
      await sub.cancel();
    }
    return events;
  }

  group('C-002 r2: refresh outcome classification', () {
    test('401 from refresh discards the session and is the only logout path',
        () async {
      adapter = ScriptedAdapter((options) async {
        if (options.uri.path.endsWith('/v1/auth/refresh')) {
          return respondJson(401, body: {'error': 'Invalid or expired'});
        }
        // Original (expired-token) request.
        return respondJson(401, body: {});
      });
      dio.httpClientAdapter = adapter;

      final events = await collectEvents(() async {
        await expectLater(
          dio.get('/v1/trips'),
          throwsA(isA<DioException>()
              .having((e) => e.response?.statusCode, 'status', 401)),
        );
      });

      expect(adapter.refreshCallCount, 1,
          reason: 'a 401 from the refresh call itself must not recurse '
              'into another refresh');
      expect(storageData.containsKey('access_token'), isFalse,
          reason: '401 is the only verdict that the session is dead');
      expect(storageData.containsKey('refresh_token'), isFalse);
      expect(storageData['fcm_token'], 'fcm-123',
          reason: 'unrelated keys must survive a session discard');
      expect(events, contains(AuthClientEvent.sessionInvalidated));
      expect(events, isNot(contains(AuthClientEvent.refreshDegraded)));
    });

    test('500 from refresh keeps the session and retries with backoff',
        () async {
      adapter = ScriptedAdapter((options) async {
        if (options.uri.path.endsWith('/v1/auth/refresh')) {
          return respondJson(500, body: {'error': 'database unreachable'});
        }
        return respondJson(401, body: {});
      });
      dio.httpClientAdapter = adapter;

      final events = await collectEvents(() async {
        await expectLater(
          dio.get('/v1/trips'),
          throwsA(isA<DioException>()
              .having((e) => e.response?.statusCode, 'status', 401)),
        );
      });

      // 1 initial attempt + 3 backoff retries (tinyBackoff has 3 delays).
      expect(adapter.refreshCallCount, 4,
          reason: 'a 5xx must be retried with backoff, not treated as logout');
      expect(storageData['access_token'], 'old-access',
          reason: 'a 5xx says nothing about the session; tokens stay on disk');
      expect(storageData['refresh_token'], 'old-refresh');
      expect(storageData['fcm_token'], 'fcm-123');
      expect(events, contains(AuthClientEvent.refreshDegraded));
      expect(events, isNot(contains(AuthClientEvent.sessionInvalidated)));
    });

    test('network failure (no HTTP response) keeps the session', () async {
      adapter = ScriptedAdapter((options) async {
        if (options.uri.path.endsWith('/v1/auth/refresh')) {
          throw networkError(options);
        }
        return respondJson(401, body: {});
      });
      dio.httpClientAdapter = adapter;

      final events = await collectEvents(() async {
        await expectLater(
          dio.get('/v1/trips'),
          throwsA(isA<DioException>()
              .having((e) => e.type, 'type', DioExceptionType.badResponse)),
        );
      });

      expect(adapter.refreshCallCount, 4);
      expect(storageData['access_token'], 'old-access');
      expect(storageData['refresh_token'], 'old-refresh');
      expect(events, contains(AuthClientEvent.refreshDegraded));
      expect(events, isNot(contains(AuthClientEvent.sessionInvalidated)));
    });

    test('a 2xx without the promised token shape is treated as a server '
        'fault, not a verdict on the session', () async {
      adapter = ScriptedAdapter((options) async {
        if (options.uri.path.endsWith('/v1/auth/refresh')) {
          return respondJson(200, body: {'oops': true});
        }
        return respondJson(401, body: {});
      });
      dio.httpClientAdapter = adapter;

      final events = await collectEvents(() async {
        await expectLater(dio.get('/v1/trips'), throwsA(isA<DioException>()));
      });

      expect(storageData['access_token'], 'old-access');
      expect(events, contains(AuthClientEvent.refreshDegraded));
      expect(events, isNot(contains(AuthClientEvent.sessionInvalidated)));
    });

    test('a 401 on an unauthenticated (public) request never refreshes',
        () async {
      storageData.clear(); // signed-out device
      adapter = ScriptedAdapter((options) async {
        return respondJson(401, body: {});
      });
      dio.httpClientAdapter = adapter;

      final events = await collectEvents(() async {
        await expectLater(
          dio.post('/v1/auth/token-exchange', data: {'firebaseIdToken': 'x'}),
          throwsA(isA<DioException>()
              .having((e) => e.response?.statusCode, 'status', 401)),
        );
      });

      expect(adapter.refreshCallCount, 0,
          reason: 'public-route 401s cannot be rescued by a refresh');
      expect(events, isEmpty);
    });

    test('a request already retried on a fresh token is never refreshed twice',
        () async {
      // Even with a fresh token the endpoint keeps answering 401 — the
      // interceptor must give up after ONE transparent retry instead of
      // looping refreshes forever.
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

      await expectLater(
        dio.get('/v1/trips'),
        throwsA(isA<DioException>()
            .having((e) => e.response?.statusCode, 'status', 401)),
      );

      expect(adapter.refreshCallCount, 1,
          reason: 'a request may carry at most one transparent auth retry');
    });
  });

  group('C-002 r2: recovery and single-flight', () {
    test('refresh recovers after one transient 500 and the request succeeds',
        () async {
      adapter = ScriptedAdapter((options) async {
        if (options.uri.path.endsWith('/v1/auth/refresh')) {
          if (adapter.refreshCallCount == 1) {
            return respondJson(500, body: {});
          }
          return respondJson(200, body: {
            'accessToken': 'new-access',
            'refreshToken': 'new-refresh',
          });
        }
        if (options.headers['Authorization'] == 'Bearer new-access') {
          return respondJson(200, body: {'ok': true});
        }
        return respondJson(401, body: {});
      });
      dio.httpClientAdapter = adapter;

      final events = await collectEvents(() async {
        final response = await dio.get('/v1/trips');
        expect(response.statusCode, 200);
      });

      expect(adapter.refreshCallCount, 2,
          reason: 'the second refresh attempt should have recovered');
      expect(storageData['access_token'], 'new-access');
      expect(storageData['refresh_token'], 'new-refresh');
      expect(events, contains(AuthClientEvent.refreshRecovered));
    });

    test('three concurrent 401s share ONE refresh run (single-flight)',
        () async {
      adapter = ScriptedAdapter((options) async {
        if (options.uri.path.endsWith('/v1/auth/refresh')) {
          // Hold the refresh open long enough for every in-flight request's
          // 401 to arrive and join the same run.
          await Future<void>.delayed(const Duration(milliseconds: 300));
          return respondJson(200, body: {
            'accessToken': 'new-access',
            'refreshToken': 'new-refresh',
          });
        }
        if (options.headers['Authorization'] == 'Bearer new-access') {
          return respondJson(200, body: {'ok': true});
        }
        return respondJson(401, body: {});
      });
      dio.httpClientAdapter = adapter;

      Future<Object?> asOutcome(Future<Response> future) async {
        try {
          return await future;
        } catch (_) {
          return 'failed';
        }
      }

      final outcomes = await Future.wait<Object?>([
        asOutcome(dio.get('/v1/trips')),
        asOutcome(dio.get('/v1/trips')),
        asOutcome(dio.get('/v1/trips')),
      ]);
      final responses = outcomes.whereType<Response>().toList();

      expect(responses.length, 3,
          reason: 'all three requests must be transparently retried and '
              'succeed on the fresh token');
      expect(adapter.refreshCallCount, 1,
          reason: 'a burst of expired-token requests must not stampede the '
              'refresh endpoint');
      expect(storageData['access_token'], 'new-access');
    });
  });
}
