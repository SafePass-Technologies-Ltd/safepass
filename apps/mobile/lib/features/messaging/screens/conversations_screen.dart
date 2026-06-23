/// ConversationsScreen — redirects to the active trip's message thread.
///
/// On mobile, users access messaging exclusively through the Active Trip screen
/// or via push notification deep links. There is no separate conversations list.
///
/// If the user has an active trip, this screen immediately pushes
/// MessageThreadScreen for that trip. If there is no active trip it shows an
/// informational empty state explaining how to access messages.
library;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme.dart';
import '../../trips/cubit/trip_monitoring_cubit.dart';
import 'message_thread_screen.dart';

class ConversationsScreen extends StatefulWidget {
  const ConversationsScreen({super.key});

  @override
  State<ConversationsScreen> createState() => _ConversationsScreenState();
}

class _ConversationsScreenState extends State<ConversationsScreen> {
  @override
  void initState() {
    super.initState();
    // Attempt to deep-link to the active trip thread on first frame.
    WidgetsBinding.instance.addPostFrameCallback((_) => _tryRedirect());
  }

  /// Navigate to the active trip's message thread if one exists.
  void _tryRedirect() {
    if (!mounted) return;
    final tripState = context.read<TripMonitoringCubit>().state;
    final tripId = tripState.trip?.id;

    final isActive = tripState.status == TripMonitorStatus.active ||
        tripState.status == TripMonitorStatus.gpsUpdating;

    if (isActive && tripId != null) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => MessageThreadScreen(
            tripId: tripId,
            participantName: 'Monitoring Officer',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<TripMonitoringCubit, TripMonitoringState>(
      // If a trip becomes active while on this screen (edge case), redirect.
      listenWhen: (prev, curr) =>
          prev.status != curr.status &&
          (curr.status == TripMonitorStatus.active ||
              curr.status == TripMonitorStatus.gpsUpdating),
      listener: (context, state) => _tryRedirect(),
      child: Scaffold(
        appBar: AppBar(title: const Text('Messages')),
        body: BlocBuilder<TripMonitoringCubit, TripMonitoringState>(
          builder: (context, state) {
            // While the cubit is loading (initial state), show a spinner.
            if (state.status == TripMonitorStatus.loading) {
              return const Center(child: CircularProgressIndicator());
            }

            // No active trip — show informational empty state.
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.chat_bubble_outline,
                      size: 64,
                      color: AppColors.darkSlate,
                    ),
                    const SizedBox(height: 24),
                    const Text(
                      'No active trip',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: AppColors.darkSlate,
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Messages with your monitoring officer appear here '
                      'during an active trip. Start a trip to begin messaging.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.darkSlate),
                    ),
                    const SizedBox(height: 32),
                    FilledButton.icon(
                      onPressed: () => context.go('/trip/register'),
                      icon: const Icon(Icons.add_location_alt_outlined),
                      label: const Text('Register a Trip'),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
