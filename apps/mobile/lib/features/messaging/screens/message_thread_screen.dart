/// MessageThreadScreen — real-time chat thread for a single trip.
///
/// Opens the conversation between the traveller and their monitoring officer.
/// Messages are loaded via REST on mount and real-time updates are delivered
/// via the trip's WebSocket channel for the duration of the screen's lifetime.
library;

import 'dart:async' show unawaited;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../app/theme.dart';
import '../cubit/messaging_cubit.dart';

class MessageThreadScreen extends StatelessWidget {
  /// The trip ID whose message thread this screen represents.
  final String tripId;

  /// Display name shown in the AppBar — typically "Monitoring Officer" or "SafePass".
  final String participantName;

  const MessageThreadScreen({
    super.key,
    required this.tripId,
    required this.participantName,
  });

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => MessagingCubit()..loadMessages(tripId),
      child: _MessageThreadView(
        tripId: tripId,
        participantName: participantName,
      ),
    );
  }
}

class _MessageThreadView extends StatefulWidget {
  final String tripId;
  final String participantName;

  const _MessageThreadView({
    required this.tripId,
    required this.participantName,
  });

  @override
  State<_MessageThreadView> createState() => _MessageThreadViewState();
}

class _MessageThreadViewState extends State<_MessageThreadView> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _connectWebSocket();
  }

  /// Read the access token from secure storage and open the WebSocket so
  /// incoming messages appear without a manual refresh.
  Future<void> _connectWebSocket() async {
    const storage = FlutterSecureStorage();
    final token = await storage.read(key: 'access_token');
    if (token != null && mounted) {
      // unawaited intentionally — connectWebSocket sets up a long-lived stream.
      unawaited(
        context.read<MessagingCubit>().connectWebSocket(widget.tripId, token),
      );
    }
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    // Close the WebSocket when the user leaves the screen.
    context.read<MessagingCubit>().disconnectWebSocket();
    super.dispose();
  }

  void _send(BuildContext context) {
    final content = _messageController.text.trim();
    if (content.isEmpty) return;
    _messageController.clear();
    context.read<MessagingCubit>().sendMessage(widget.tripId, content);
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.participantName),
        actions: [
          // WebSocket connectivity indicator — subtle, non-interactive.
          BlocBuilder<MessagingCubit, MessagingState>(
            buildWhen: (prev, curr) => prev.wsConnected != curr.wsConnected,
            builder: (context, state) => Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Tooltip(
                message: state.wsConnected ? 'Live updates on' : 'Reconnecting…',
                child: Icon(
                  Icons.circle,
                  size: 10,
                  color: state.wsConnected
                      ? AppColors.safetyGreen
                      : Colors.grey.shade400,
                ),
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: BlocConsumer<MessagingCubit, MessagingState>(
              listenWhen: (prev, curr) =>
                  curr.messages.length != prev.messages.length,
              listener: (context, state) {
                WidgetsBinding.instance
                    .addPostFrameCallback((_) => _scrollToBottom());
              },
              builder: (context, state) {
                if (state.status == MessagingStatus.loading &&
                    state.messages.isEmpty) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (state.status == MessagingStatus.error &&
                    state.messages.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.error_outline,
                              color: AppColors.emergencyRed, size: 48),
                          const SizedBox(height: 16),
                          Text(
                            state.errorMessage ?? 'Failed to load messages',
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: AppColors.emergencyRed),
                          ),
                          const SizedBox(height: 24),
                          FilledButton(
                            onPressed: () => context
                                .read<MessagingCubit>()
                                .loadMessages(widget.tripId),
                            child: const Text('Retry'),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                if (state.messages.isEmpty) {
                  return const Center(
                    child: Text(
                      'No messages yet.\nSend a message to your officer.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.darkSlate),
                    ),
                  );
                }

                return ListView.builder(
                  controller: _scrollController,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  itemCount: state.messages.length,
                  itemBuilder: (context, index) {
                    final msg = state.messages[index];
                    return _MessageBubble(message: msg);
                  },
                );
              },
            ),
          ),
          _buildInputBar(context),
        ],
      ),
    );
  }

  Widget _buildInputBar(BuildContext context) {
    return BlocBuilder<MessagingCubit, MessagingState>(
      buildWhen: (prev, curr) => prev.status != curr.status,
      builder: (context, state) {
        final isSending = state.status == MessagingStatus.sending;
        return SafeArea(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.white,
              border: Border(
                top: BorderSide(color: Colors.grey.shade200),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    decoration: const InputDecoration(
                      hintText: 'Type a message...',
                      border: OutlineInputBorder(),
                      contentPadding:
                          EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _send(context),
                  ),
                ),
                const SizedBox(width: 8),
                isSending
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      )
                    : IconButton(
                        onPressed: () => _send(context),
                        icon: const Icon(Icons.send),
                        color: AppColors.primary,
                      ),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ────────────────────────────────────────────────────────────
// Message bubble
// ────────────────────────────────────────────────────────────

class _MessageBubble extends StatelessWidget {
  final Message message;

  const _MessageBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    // Check-in messages get a distinct visual treatment.
    final isCheckIn = message.messageType == 'check_in';

    return Align(
      alignment: message.isOwn ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        constraints:
            BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isCheckIn
              ? const Color(0xFFEFF6FF) // light blue for check-in messages
              : message.isOwn
                  ? AppColors.primary
                  : const Color(0xFFE2E8F0),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(message.isOwn ? 16 : 4),
            bottomRight: Radius.circular(message.isOwn ? 4 : 16),
          ),
          border: isCheckIn
              ? Border.all(color: const Color(0xFF93C5FD))
              : null,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Check-in label above the message content.
            if (isCheckIn) ...[
              const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.check_circle_outline,
                      size: 14, color: Color(0xFF3B82F6)),
                  SizedBox(width: 4),
                  Text(
                    'Check-in',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF1E40AF),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
            ],
            Text(
              message.content,
              style: TextStyle(
                color: isCheckIn
                    ? const Color(0xFF1E40AF)
                    : message.isOwn
                        ? AppColors.white
                        : AppColors.darkSlate,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              _formatTime(message.createdAt),
              style: TextStyle(
                fontSize: 10,
                color: isCheckIn
                    ? const Color(0xFF93C5FD)
                    : message.isOwn
                        ? AppColors.white.withValues(alpha: 0.7)
                        : AppColors.darkSlate.withValues(alpha: 0.5),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatTime(String iso) {
    if (iso.isEmpty) return '';
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return '';
    }
  }
}
