import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';

class Conversation extends Equatable {
  final String id;
  final String participantName;
  final String lastMessage;
  final int unreadCount;
  final String updatedAt;

  const Conversation({
    required this.id,
    required this.participantName,
    required this.lastMessage,
    required this.unreadCount,
    required this.updatedAt,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) => Conversation(
        id: json['id'] as String,
        participantName: json['participantName'] as String? ?? 'Unknown',
        lastMessage: json['lastMessage'] as String? ?? '',
        unreadCount: json['unreadCount'] as int? ?? 0,
        updatedAt: json['updatedAt'] as String? ?? '',
      );

  @override
  List<Object?> get props => [id, participantName, lastMessage, unreadCount, updatedAt];
}

class Message extends Equatable {
  final String id;
  final String senderId;
  final String content;
  final String createdAt;
  final bool isOwn;

  const Message({
    required this.id,
    required this.senderId,
    required this.content,
    required this.createdAt,
    required this.isOwn,
  });

  factory Message.fromJson(Map<String, dynamic> json, {required String currentUserId}) =>
      Message(
        id: json['id'] as String,
        senderId: json['senderId'] as String,
        content: json['content'] as String? ?? '',
        createdAt: json['createdAt'] as String? ?? '',
        isOwn: json['senderId'] == currentUserId,
      );

  @override
  List<Object?> get props => [id, senderId, content, createdAt, isOwn];
}

enum MessagingStatus { initial, loading, loaded, sending, error }

class MessagingState extends Equatable {
  final MessagingStatus status;
  final List<Conversation> conversations;
  final List<Message> messages;
  final String? activeConversationId;
  final String? errorMessage;

  const MessagingState({
    this.status = MessagingStatus.initial,
    this.conversations = const [],
    this.messages = const [],
    this.activeConversationId,
    this.errorMessage,
  });

  MessagingState copyWith({
    MessagingStatus? status,
    List<Conversation>? conversations,
    List<Message>? messages,
    String? activeConversationId,
    String? errorMessage,
  }) {
    return MessagingState(
      status: status ?? this.status,
      conversations: conversations ?? this.conversations,
      messages: messages ?? this.messages,
      activeConversationId: activeConversationId ?? this.activeConversationId,
      errorMessage: errorMessage,
    );
  }

  @override
  List<Object?> get props =>
      [status, conversations, messages, activeConversationId, errorMessage];
}

class MessagingCubit extends Cubit<MessagingState> {
  MessagingCubit() : super(const MessagingState());

  final _dio = ApiClient.instance.dio;

  Future<void> loadConversations() async {
    emit(state.copyWith(status: MessagingStatus.loading));

    try {
      final response = await _dio.get('/v1/messages/conversations');
      final data = response.data;
      final list = (data is List ? data : data['conversations'] as List<dynamic>? ?? []);

      final conversations = list
          .map((c) => Conversation.fromJson(c as Map<String, dynamic>))
          .toList();

      emit(state.copyWith(
        status: MessagingStatus.loaded,
        conversations: conversations,
      ));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: MessagingStatus.error,
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Failed to load conversations',
      ));
    }
  }

  Future<void> loadMessages(String conversationId) async {
    emit(state.copyWith(
      status: MessagingStatus.loading,
      activeConversationId: conversationId,
    ));

    try {
      final response =
          await _dio.get('/v1/messages/conversations/$conversationId/messages');
      final data = response.data;
      final list = (data is List ? data : data['messages'] as List<dynamic>? ?? []);

      final messages = list
          .map((m) => Message.fromJson(
                m as Map<String, dynamic>,
                currentUserId: data['currentUserId'] as String? ?? '',
              ))
          .toList();

      emit(state.copyWith(
        status: MessagingStatus.loaded,
        messages: messages,
      ));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: MessagingStatus.error,
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Failed to load messages',
      ));
    }
  }

  Future<void> sendMessage(String conversationId, String content) async {
    emit(state.copyWith(status: MessagingStatus.sending));

    try {
      await _dio.post('/v1/messages', data: {
        'conversationId': conversationId,
        'content': content,
      });

      await loadMessages(conversationId);
    } on DioException catch (e) {
      emit(state.copyWith(
        status: MessagingStatus.error,
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Failed to send message',
      ));
    }
  }
}
