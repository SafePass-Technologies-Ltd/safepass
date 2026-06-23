/// Scheduled Trips Screen (Screen 21) — calendar view of future trips.
///
/// Lists the user's scheduled trips with filter tabs (Upcoming / Missed / Past).
/// Each card shows destination, date/time, status badge, and optional label.
/// FAB opens the create bottom sheet (Screen 21b).
/// "Start Trip" on a card pre-fills and navigates to trip registration.
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../app/theme.dart';
import '../../../app/router.dart';
import '../cubit/scheduled_trips_cubit.dart';
import '../cubit/trip_registration_cubit.dart' show PlaceLocation;
import 'schedule_trip_sheet.dart';

class ScheduledTripsScreen extends StatelessWidget {
  const ScheduledTripsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => ScheduledTripsCubit()..loadTrips(),
      child: const _ScheduledTripsView(),
    );
  }
}

class _ScheduledTripsView extends StatelessWidget {
  const _ScheduledTripsView();

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: ScheduledTripFilter.values.length,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Scheduled Trips'),
          centerTitle: true,
          bottom: TabBar(
            onTap: (index) {
              context
                  .read<ScheduledTripsCubit>()
                  .setFilter(ScheduledTripFilter.values[index]);
            },
            tabs: ScheduledTripFilter.values
                .map((f) => Tab(text: f.label))
                .toList(),
          ),
        ),
        body: BlocConsumer<ScheduledTripsCubit, ScheduledTripsState>(
          listener: (context, state) {
            if (state.errorMessage != null &&
                state.status == ScheduledTripsStatus.error) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(state.errorMessage!),
                  backgroundColor: AppColors.emergencyRed,
                ),
              );
            }
          },
          builder: (context, state) {
            if (state.status == ScheduledTripsStatus.loading) {
              return const Center(child: CircularProgressIndicator());
            }

            if (state.status == ScheduledTripsStatus.error &&
                state.trips.isEmpty) {
              return _ErrorState(
                message: state.errorMessage ?? 'Something went wrong',
                onRetry: () =>
                    context.read<ScheduledTripsCubit>().loadTrips(),
              );
            }

            if (state.trips.isEmpty) {
              return _EmptyState(filter: state.filter);
            }

            return RefreshIndicator(
              onRefresh: () =>
                  context.read<ScheduledTripsCubit>().loadTrips(),
              child: ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: state.trips.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  return _TripCard(trip: state.trips[index]);
                },
              ),
            );
          },
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () => _openCreateSheet(context, prefillDestination: null),
          icon: const Icon(Icons.add),
          label: const Text('Schedule Trip'),
          backgroundColor: AppColors.primary,
        ),
      ),
    );
  }

  Future<void> _openCreateSheet(
    BuildContext context, {
    PlaceLocation? prefillDestination,
  }) async {
    final cubit = context.read<ScheduledTripsCubit>();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => BlocProvider.value(
        value: cubit,
        child: ScheduleTripSheet(prefillDestination: prefillDestination),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────
// Trip Card
// ────────────────────────────────────────────────────────────

class _TripCard extends StatelessWidget {
  final ScheduledTrip trip;

  const _TripCard({required this.trip});

  @override
  Widget build(BuildContext context) {
    final dateFormatter = DateFormat('EEE, d MMM yyyy');
    final timeFormatter = DateFormat('h:mm a');
    final isUpcoming = trip.status == ScheduledTripStatus.upcoming;

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header row: destination + status badge ──
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (trip.label != null) ...[
                        Text(
                          trip.label!,
                          style: Theme.of(context)
                              .textTheme
                              .labelMedium
                              ?.copyWith(color: AppColors.primary),
                        ),
                        const SizedBox(height: 2),
                      ],
                      Text(
                        trip.destination.name ?? 'Unknown destination',
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                _StatusBadge(status: trip.status),
              ],
            ),
            const SizedBox(height: 10),

            // ── Date and time ──
            Row(
              children: [
                const Icon(Icons.calendar_today_outlined,
                    size: 16, color: AppColors.darkSlate),
                const SizedBox(width: 6),
                Text(
                  dateFormatter.format(trip.scheduledAt.toLocal()),
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(width: 16),
                const Icon(Icons.access_time_outlined,
                    size: 16, color: AppColors.darkSlate),
                const SizedBox(width: 6),
                Text(
                  timeFormatter.format(trip.scheduledAt.toLocal()),
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),

            // ── Transport company (if any) ──
            if (trip.transportCompany != null) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  const Icon(Icons.business_outlined,
                      size: 16, color: AppColors.darkSlate),
                  const SizedBox(width: 6),
                  Text(
                    trip.transportCompany!,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ],

            // ── Actions (only for upcoming trips) ──
            if (isUpcoming) ...[
              const SizedBox(height: 12),
              const Divider(height: 1),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  // Cancel
                  TextButton.icon(
                    onPressed: () => _confirmCancel(context, trip),
                    icon: const Icon(Icons.cancel_outlined, size: 16),
                    label: const Text('Cancel'),
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.emergencyRed,
                    ),
                  ),
                  const SizedBox(width: 8),
                  // Start Trip — pre-fills the trip registration form
                  FilledButton.icon(
                    onPressed: () => _startTripNow(context, trip),
                    icon: const Icon(Icons.play_arrow, size: 16),
                    label: const Text('Start Trip'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.safetyGreen,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Show a confirmation dialog before cancelling.
  void _confirmCancel(BuildContext context, ScheduledTrip trip) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancel scheduled trip?'),
        content: Text(
          'This will cancel your trip to '
          '${trip.destination.name ?? 'the destination'}. '
          'You can schedule a new one at any time.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Keep'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              context
                  .read<ScheduledTripsCubit>()
                  .cancelScheduledTrip(trip.id);
            },
            style: TextButton.styleFrom(
                foregroundColor: AppColors.emergencyRed),
            child: const Text('Cancel Trip'),
          ),
        ],
      ),
    );
  }

  /// Navigate to trip registration with destination pre-filled.
  void _startTripNow(BuildContext context, ScheduledTrip trip) {
    context.push(
      AppRoutes.tripRegistration,
      extra: trip.destination,
    );
  }
}

// ────────────────────────────────────────────────────────────
// Status Badge
// ────────────────────────────────────────────────────────────

class _StatusBadge extends StatelessWidget {
  final ScheduledTripStatus status;

  const _StatusBadge({required this.status});

  Color get _color {
    switch (status) {
      case ScheduledTripStatus.upcoming:
        return AppColors.primary;
      case ScheduledTripStatus.missed:
        return AppColors.alertAmber;
      case ScheduledTripStatus.started:
        return AppColors.safetyGreen;
      case ScheduledTripStatus.cancelled:
        return AppColors.emergencyRed;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: _color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _color.withValues(alpha: 0.4)),
      ),
      child: Text(
        status.label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: _color,
              fontWeight: FontWeight.w600,
            ),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────
// Empty / Error states
// ────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  final ScheduledTripFilter filter;

  const _EmptyState({required this.filter});

  @override
  Widget build(BuildContext context) {
    final messages = {
      ScheduledTripFilter.upcoming:
          'No upcoming trips.\nTap the button below to schedule one.',
      ScheduledTripFilter.missed:
          'No missed trips — great job staying on schedule!',
      ScheduledTripFilter.past: 'No past scheduled trips yet.',
    };

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.calendar_month_outlined,
              size: 64,
              color: AppColors.darkSlate.withValues(alpha: 0.3),
            ),
            const SizedBox(height: 16),
            Text(
              messages[filter]!,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppColors.darkSlate.withValues(alpha: 0.6),
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline,
                size: 48, color: AppColors.emergencyRed),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: AppColors.emergencyRed),
            ),
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: onRetry,
              child: const Text('Try Again'),
            ),
          ],
        ),
      ),
    );
  }
}
