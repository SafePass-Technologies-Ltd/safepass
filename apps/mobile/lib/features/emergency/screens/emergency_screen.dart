import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../app/theme.dart';
import '../cubit/emergency_cubit.dart';

class EmergencyScreen extends StatelessWidget {
  final String tripId;

  const EmergencyScreen({super.key, required this.tripId});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => EmergencyCubit(),
      child: _EmergencyView(tripId: tripId),
    );
  }
}

class _EmergencyView extends StatelessWidget {
  final String tripId;

  const _EmergencyView({required this.tripId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Emergency'),
        backgroundColor: AppColors.emergencyRed,
      ),
      body: BlocBuilder<EmergencyCubit, EmergencyState>(
        builder: (context, state) {
          if (state.status == EmergencyStatus.triggering) {
            return const Center(child: CircularProgressIndicator());
          }

          if (state.status == EmergencyStatus.active ||
              state.status == EmergencyStatus.checkingIn) {
            return _ActiveEmergencyView(tripId: tripId);
          }

          if (state.status == EmergencyStatus.checkedIn) {
            return _buildCheckedInView(context);
          }

          if (state.status == EmergencyStatus.error) {
            return _buildErrorView(context, state.errorMessage ?? 'Unknown error');
          }

          return _buildInitialView(context);
        },
      ),
    );
  }

  Widget _buildInitialView(BuildContext context) {
    final cubit = context.read<EmergencyCubit>();
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text(
              'Press the button below if you are in danger.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 16, color: AppColors.darkSlate),
            ),
            const SizedBox(height: 48),
            GestureDetector(
              onTap: () => cubit.triggerPanic(tripId),
              child: Container(
                width: 200,
                height: 200,
                decoration: BoxDecoration(
                  color: AppColors.emergencyRed,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.emergencyRed.withValues(alpha: 0.4),
                      blurRadius: 24,
                      spreadRadius: 4,
                    ),
                  ],
                ),
                child: const Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.emergency, size: 64, color: AppColors.white),
                    SizedBox(height: 8),
                    Text(
                      'Activate Emergency',
                      style: TextStyle(
                        color: AppColors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCheckedInView(BuildContext context) {
    return Column(
      children: [
        Container(
          width: double.infinity,
          color: AppColors.safetyGreen,
          padding: const EdgeInsets.all(16),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.check_circle, color: AppColors.white),
              SizedBox(width: 8),
              Text(
                'Checked In — Monitoring team notified',
                style: TextStyle(color: AppColors.white, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildErrorView(BuildContext context, String message) {
    final cubit = context.read<EmergencyCubit>();
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, color: AppColors.emergencyRed, size: 48),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.emergencyRed),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: cubit.cancel,
              child: const Text('Try Again'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActiveEmergencyView extends StatefulWidget {
  final String tripId;

  const _ActiveEmergencyView({required this.tripId});

  @override
  State<_ActiveEmergencyView> createState() => _ActiveEmergencyViewState();
}

class _ActiveEmergencyViewState extends State<_ActiveEmergencyView> {
  late Timer _timer;
  int _seconds = 0;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _seconds++);
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  String get _elapsed {
    final m = _seconds ~/ 60;
    final s = _seconds % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<EmergencyCubit>();
    final isCheckingIn =
        context.watch<EmergencyCubit>().state.status == EmergencyStatus.checkingIn;

    return Column(
      children: [
        Container(
          width: double.infinity,
          color: AppColors.emergencyRed,
          padding: const EdgeInsets.all(16),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.emergency, color: AppColors.white),
              SizedBox(width: 8),
              Text(
                'Emergency Active — Help is on the way',
                style: TextStyle(color: AppColors.white, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
        Expanded(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text('Time elapsed', style: TextStyle(color: AppColors.darkSlate)),
                  const SizedBox(height: 8),
                  Text(
                    _elapsed,
                    style: const TextStyle(
                      fontSize: 48,
                      fontWeight: FontWeight.bold,
                      color: AppColors.emergencyRed,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                  const SizedBox(height: 48),
                  FilledButton.icon(
                    onPressed: isCheckingIn ? null : cubit.checkIn,
                    icon: isCheckingIn
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.white,
                            ),
                          )
                        : const Icon(Icons.check_circle_outline),
                    label: const Text("Check In (I'm Safe)"),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.safetyGreen,
                      minimumSize: const Size(double.infinity, 52),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
