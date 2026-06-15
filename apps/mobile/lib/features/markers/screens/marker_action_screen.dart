import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../app/theme.dart';
import '../cubit/marker_cubit.dart';

class MarkerActionScreen extends StatelessWidget {
  final String markerId;

  const MarkerActionScreen({super.key, required this.markerId});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => MarkerCubit()..loadMarker(markerId),
      child: _MarkerActionView(markerId: markerId),
    );
  }
}

class _MarkerActionView extends StatelessWidget {
  final String markerId;

  const _MarkerActionView({required this.markerId});

  static const _markerTypes = [
    'robbery',
    'accident',
    'flood',
    'fire',
    'road_block',
    'medical',
    'suspicious_activity',
    'other',
  ];

  void _showReclassifyDialog(BuildContext context) {
    String? selectedType;
    showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            return AlertDialog(
              title: const Text('Reclassify Marker'),
              content: DropdownButtonFormField<String>(
                decoration: const InputDecoration(
                  labelText: 'New Type',
                  border: OutlineInputBorder(),
                ),
                items: _markerTypes
                    .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                    .toList(),
                onChanged: (v) => setDialogState(() => selectedType = v),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: selectedType != null
                      ? () {
                          Navigator.of(dialogContext).pop();
                          context
                              .read<MarkerCubit>()
                              .reclassifyMarker(markerId, selectedType!);
                        }
                      : null,
                  child: const Text('Reclassify'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Map Marker')),
      body: BlocConsumer<MarkerCubit, MarkerState>(
        listener: (context, state) {
          if (state.status == MarkerActionStatus.success &&
              state.marker != null) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Action completed successfully.')),
            );
          }
        },
        builder: (context, state) {
          if (state.status == MarkerActionStatus.loading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (state.status == MarkerActionStatus.error && state.marker == null) {
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
                      state.errorMessage ?? 'Failed to load marker',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppColors.emergencyRed),
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: () =>
                          context.read<MarkerCubit>().loadMarker(markerId),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            );
          }

          final marker = state.marker;
          if (marker == null) return const SizedBox.shrink();

          final isSubmitting = state.status == MarkerActionStatus.submitting;
          final cubit = context.read<MarkerCubit>();

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _DetailRow(label: 'Type', value: marker.type),
                        const Divider(height: 24),
                        _DetailRow(
                            label: 'Description',
                            value: marker.description.isNotEmpty
                                ? marker.description
                                : '—'),
                        const Divider(height: 24),
                        _DetailRow(
                          label: 'Location',
                          value:
                              '${marker.latitude.toStringAsFixed(5)}, ${marker.longitude.toStringAsFixed(5)}',
                        ),
                        const Divider(height: 24),
                        _DetailRow(label: 'Status', value: marker.status),
                        const Divider(height: 24),
                        Row(
                          children: [
                            Expanded(
                              child: _StatChip(
                                label: 'Confirmed',
                                count: marker.verifiedCount,
                                color: AppColors.safetyGreen,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _StatChip(
                                label: 'Disputed',
                                count: marker.disputeCount,
                                color: AppColors.emergencyRed,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                if (state.status == MarkerActionStatus.error) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.emergencyRed.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: AppColors.emergencyRed.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Text(
                      state.errorMessage ?? 'Action failed',
                      style: const TextStyle(color: AppColors.emergencyRed),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: isSubmitting
                            ? null
                            : () => cubit.confirmMarker(markerId),
                        icon: const Icon(Icons.check_circle_outline),
                        label: const Text('Confirm'),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.safetyGreen,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: isSubmitting
                            ? null
                            : () => cubit.disputeMarker(markerId),
                        icon: const Icon(Icons.cancel_outlined),
                        label: const Text('Dispute'),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.emergencyRed,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: isSubmitting
                      ? null
                      : () => _showReclassifyDialog(context),
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Reclassify'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
                if (isSubmitting) ...[
                  const SizedBox(height: 16),
                  const Center(child: CircularProgressIndicator()),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;

  const _DetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 100,
          child: Text(
            label,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              color: AppColors.darkSlate,
            ),
          ),
        ),
        Expanded(
          child: Text(value, style: const TextStyle(color: AppColors.darkSlate)),
        ),
      ],
    );
  }
}

class _StatChip extends StatelessWidget {
  final String label;
  final int count;
  final Color color;

  const _StatChip({
    required this.label,
    required this.count,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Text(
            '$count',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          Text(
            label,
            style: TextStyle(fontSize: 12, color: color),
          ),
        ],
      ),
    );
  }
}
