/// MessagingCubit — manages in-trip chat state for the mobile app.
///
/// All operations are scoped to a single active trip:
///   - loadMessages(tripId)  → GET /v1/trips/:tripId/messages
///   - sendMessage(...)      → POST /v1/trips/:tripId/messages
///   - markRead(tripId)      → POST /v1/trips/:tripId/messages/read
///   - connectWebSocket(...)  → subscribe to real-time new_message events
///   - disconnectWebSocket() → clean up on screen dispose
///
/// The Conversation model is no longer used on mobile (the admin dashboard
/// owns the conversations list). It is kept as a stub for API compatibility.

import 'dart:async';
import 'dart:convert';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../../../core/api/api_client.dart';
import '../../../core/constants.dart';

// ────────────────────────────────────────────────────────────
// Models
// ────────────────────────────────────────────────────────────

class Message extends Equatable {
  final String id;
  final String tripId;
  final String senderId;
  final String senderRole; // 'user' | 'monitoring_officer' | 'admin' | 'system'
  final String content;
  final String messageType; // 'text' | 'check_in' | 'alert' | 'system'
  final bool isRead;
  final String createdAt;

  /// True when this message was sent by the current device's user.
  /// Determined by senderRole == 'user' (travellers are always 'user').
  final bool isOwn;

  const Message({
    required this.id,
    required this.tripId,
    required this.senderId,
    required this.senderRole,
    required this.content,
    required this.messageType,
    required this.isRead,
    required this.createdAt,
    required this.isOwn,
  });

  factory Message.fromJson(Map<String, dynamic> json) => Message(
        id: json['id'] as String,
        tripId: json['tripId'] as String? ?? '',
        senderId: json['senderId'] as String? ?? '',
        senderRole: json['senderRole'] as String? ?? 'user',
        content: json['content'] as String? ?? '',
        messageType: json['messageType'] as String? ?? 'text',
        isRead: json['isRead'] as bool? ?? false,
        createdAt: json['createdAt'] as String? ?? '',
        // Messages sent by the traveller have senderRole == 'user'.
        // On mobile, the current user is always the traveller.
        isOwn: (json['senderRole'] as String?) == 'user',
      );

  @override
  List<Object?> get props => [
        id, tripId, senderId, senderRole, content,
        messageType, isRead, createdAt, isOwn,
      ];
}

// ────────────────────────────────────────────────────────────
// State
// ────────────────────────────────────────────────────────────

enum MessagingStatus { initial, loading, loaded, sending, error }

class MessagingState extends Equatable {
  final MessagingStatus status;
  final List<Message> messages;
  final String? activeTripId;
  final String? errorMessage;
  final bool wsConnected;

  const MessagingState({
    this.status = MessagingStatus.initial,
    this.messages = const [],
    this.activeTripId,
    this.errorMessage,
    this.wsConnected = false,
  });

  MessagingState copyWith({
    MessagingStatus? status,
    List<Message>? messages,
    String? activeTripId,
    String? errorMessage,
    bool? wsConnected,
  }) {
    return MessagingState(
      status: status ?? this.status,
      messages: messages ?? this.messages,
      activeTripId: activeTripId ?? this.activeTripId,
      errorMessage: errorMessage,
      wsConnected: wsConnected ?? this.wsConnected,
    );
  }

  @override
  List<Object?> get props =>
      [status, messages, activeTripId, errorMessage, wsConnected];
}

// ────────────────────────────────────────────────────────────
// Cubit
// ────────────────────────────────────────────────────────────

class MessagingCubit extends Cubit<MessagingState> {
  MessagingCubit() : super(const MessagingState());

  final _dio = ApiClient.instance.dio;

  /// Active WebSocket channel for real-time message delivery.
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _wsSub;

  // ── Load messages ─────────────────────────────────────────

  /// Fetch all messages for a trip (oldest first).
  ///
  /// Uses GET /v1/trips/:tripId/messages — the trip-scoped endpoint
  /// accessible to both the traveller and monitoring officers.
  Future<void> loadMessages(String tripId) async {
    emit(state.copyWith(
      status: MessagingStatus.loading,
      activeTripId: tripId,
    ));

    try {
      final response = await _dio.get('/v1/trips/$tripId/messages');
      final data = response.data as Map<String, dynamic>;
      final list = data['messages'] as List<dynamic>? ?? [];

      final messages = list
          .map((m) => Message.fromJson(m as Map<String, dynamic>))
          .toList();

      emit(state.copyWith(
        status: MessagingStatus.loaded,
        messages: messages,
      ));

      // Mark messages from the officer as read now that the user opened the thread.
      unawaited(markRead(tripId));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: MessagingStatus.error,
        errorMessage:
            (e.response?.data as Map?)?['error']?['message'] as String? ??
                'Failed to load messages',
      ));
    }
  }

  // ── Send message ──────────────────────────────────────────

  /// Send a text message in the trip's chat thread.
  ///
  /// Uses POST /v1/trips/:tripId/messages with body { content, messageType }.
  /// The server determines senderRole from the JWT.
  Future<void> sendMessage(String tripId, String content) async {
    if (content.trim().isEmpty) return;

    emit(state.copyWith(status: MessagingStatus.sending));

    try {
      final response = await _dio.post(
        '/v1/trips/$tripId/messages',
        data: {'content': content.trim(), 'messageType': 'text'},
      );

      final msg = Message.fromJson(response.data as Map<String, dynamic>);

      // Append the sent message to the local list immediately for optimistic UI.
      // The WebSocket will also deliver it back but we deduplicate by ID.
      emit(state.copyWith(
        status: MessagingStatus.loaded,
        messages: [...state.messages, msg],
      ));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: MessagingStatus.error,
        errorMessage:
            (e.response?.data as Map?)?['error']?['message'] as String? ??
                'Failed to send message',
      ));
    }
  }

  // ── Mark read ─────────────────────────────────────────────

  /// Mark all messages in the trip as read for the current user.
  ///
  /// Non-fatal — a failure here must not affect UI state.
  Future<void> markRead(String tripId) async {
    try {
      await _dio.post('/v1/trips/$tripId/messages/read');
    } catch (_) {
      // Silently ignore — read status is best-effort on mobile.
    }
  }

  // ── WebSocket ─────────────────────────────────────────────

  /// Open a WebSocket connection and subscribe to real-time new_message events
  /// for the given trip.
  ///
  /// Should be called when MessageThreadScreen is opened. The connection is
  /// kept alive for the lifetime of the screen and torn down in [disconnectWebSocket].
  Future<void> connectWebSocket(String tripId, String jwtToken) async {
    // Avoid duplicate connections.
    if (_channel != null) return;

    final wsUrl = Uri.parse('$kWsBaseUrl?token=${Uri.encodeComponent(jwtToken)}');

    try {
      _channel = WebSocketChannel.connect(wsUrl);

      // Subscribe to this specific trip's events so we receive new_message broadcasts.
      _channel!.sink.add(jsonEncode({'type': 'subscribe', 'tripId': tripId}));

      emit(state.copyWith(wsConnected: true));

      _wsSub = _channel!.stream.listen(
        (raw) {
          try {
            final envelope = jsonDecode(raw as String) as Map<String, dynamic>;
            if (envelope['type'] == 'new_message' &&
                envelope['tripId'] == tripId) {
              final payload =
                  envelope['payload'] as Map<String, dynamic>? ?? {};

              final msg = Message(
                id: payload['id'] as String? ?? '',
                tripId: tripId,
                senderId: payload['senderId'] as String? ?? '',
                senderRole: payload['senderRole'] as String? ?? 'monitoring_officer',
                content: payload['content'] as String? ?? '',
                messageType: payload['messageType'] as String? ?? 'text',
                isRead: false,
                createdAt: payload['createdAt'] as String? ??
                    DateTime.now().toIso8601String(),
                // On mobile the current user is always a traveller — messages
                // from the server are from the officer.
                isOwn: (payload['senderRole'] as String?) == 'user',
              );

              // Deduplicate: skip if we already have this message (e.g. from
              // the optimistic send path).
              if (!state.messages.any((m) => m.id == msg.id)) {
                emit(state.copyWith(
                  messages: [...state.messages, msg],
                ));
              }
            }
          } catch (_) {
            // Ignore malformed WS messages — they must not crash the app.
          }
        },
        onError: (_) => emit(state.copyWith(wsConnected: false)),
        onDone: () => emit(state.copyWith(wsConnected: false)),
        cancelOnError: false,
      );
    } catch (e) {
      // WebSocket connection failed — the user can still send messages via REST.
      emit(state.copyWith(wsConnected: false));
    }
  }

  /// Close the WebSocket connection and clean up subscriptions.
  ///
  /// Call this from MessageThreadScreen.dispose().
  Future<void> disconnectWebSocket() async {
    await _wsSub?.cancel();
    _wsSub = null;
    await _channel?.sink.close();
    _channel = null;
    emit(state.copyWith(wsConnected: false));
  }

  @override
  Future<void> close() async {
    await disconnectWebSocket();
    return super.close();
  }
}
