/// Shared test doubles for the API-client and auth-cubit suites.
///
/// Provides:
///   * an in-memory secure storage bound to `TestFlutterSecureStoragePlatform`
///     (ships with flutter_secure_storage 10, so no hand-rolled fake needed),
///   * `ScriptedAdapter`, a dio `HttpClientAdapter` stub. This is used instead
///     of a real loopback HTTP server because `flutter_test` intercepts real
///     sockets (requests are answered with 400 inside the test zone); a
///     scripted adapter still exercises dio's full interceptor pipeline.
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_secure_storage/test/test_flutter_secure_storage_platform.dart';
import 'package:flutter_secure_storage_platform_interface/flutter_secure_storage_platform_interface.dart';

/// Installs an in-memory secure storage and returns a client bound to it.
///
/// [data] is the live backing map — tests mutate or assert on it directly.
FlutterSecureStorage installMemorySecureStorage(Map<String, String> data) {
  FlutterSecureStoragePlatform.instance = TestFlutterSecureStoragePlatform(data);
  return const FlutterSecureStorage();
}

/// Scripted request handler returning the response for [options], or throwing
/// [networkError] to simulate a connection failure with no HTTP response.
typedef ScriptedHandler = Future<ResponseBody> Function(RequestOptions options);

/// A dio adapter whose responses come entirely from a test-provided handler.
class ScriptedAdapter implements HttpClientAdapter {
  ScriptedAdapter(this.handler);

  final ScriptedHandler handler;

  final List<String> requestLog = [];

  /// Every POST to `/v1/auth/refresh` seen by this adapter.
  int get refreshCallCount => requestLog
      .where((entry) => entry.endsWith('/v1/auth/refresh'))
      .length;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requestLog.add('${options.method} ${options.uri.path}');
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

/// Answer [options] with [status] and a JSON body.
ResponseBody respondJson(int status, {Object? body}) =>
    ResponseBody.fromString(
      jsonEncode(body ?? {}),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

/// A connection-level failure: no status code at all, as a dead server or
/// dropped link would produce.
DioException networkError(RequestOptions options) => DioException(
      requestOptions: options,
      type: DioExceptionType.connectionError,
      error: 'connection reset by test stub',
    );
