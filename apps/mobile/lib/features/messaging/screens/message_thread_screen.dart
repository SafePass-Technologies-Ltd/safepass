import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../app/theme.dart';
import '../cubit/messaging_cubit.dart';

class MessageThreadScreen extends StatelessWidget {
  final String conversationId;
  final String participantName;

  const MessageThreadScreen({
    super.key,
    required this.conversationId,
    required this.participantName,
  });

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => MessagingCubit()..loadMessages(conversationId),
      child: _MessageThreadView(
        conversationId: conversationId,
        participantName: participantName,
      ),
    );
  }
}

class _MessageThreadView extends StatefulWidget {
  final String conversationId;
  final String participantName;

  const _MessageThreadView({
    required this.conversationId,
    required this.participantName,
  });

  @override
  State<_MessageThreadView> createState() => _MessageThreadViewState();
}

class _MessageThreadViewState extends State<_MessageThreadView> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _send(BuildContext context) {
    final content = _messageController.text.trim();
    if (content.isEmpty) return;
    _messageController.clear();
    context.read<MessagingCubit>().sendMessage(widget.conversationId, content);
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
      appBar: AppBar(title: Text(widget.participantName)),
      body: Column(
        children: [
          Expanded(
            child: BlocConsumer<MessagingCubit, MessagingState>(
              listener: (context, state) {
                if (state.status == MessagingStatus.loaded) {
                  WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
                }
              },
              builder: (context, state) {
                if (state.status == MessagingStatus.loading &&
                    state.messages.isEmpty) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (state.status == MessagingStatus.error &&
                    state.messages.isEmpty) {
                  return Center(
                    child: Text(
                      state.errorMessage ?? 'Failed to load messages',
                      style: const TextStyle(color: AppColors.emergencyRed),
                    ),
                  );
                }

                if (state.messages.isEmpty) {
                  return const Center(
                    child: Text(
                      'No messages yet. Say hello!',
                      style: TextStyle(color: AppColors.darkSlate),
                    ),
                  );
                }

                return ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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

class _MessageBubble extends StatelessWidget {
  final Message message;

  const _MessageBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: message.isOwn ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.72,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: message.isOwn ? AppColors.primary : const Color(0xFFE2E8F0),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(message.isOwn ? 16 : 4),
            bottomRight: Radius.circular(message.isOwn ? 4 : 16),
          ),
        ),
        child: Text(
          message.content,
          style: TextStyle(
            color: message.isOwn ? AppColors.white : AppColors.darkSlate,
          ),
        ),
      ),
    );
  }
}
