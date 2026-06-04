/// Home Screen — Map view with quick actions.
///
/// Shows the user's current location on a map (placeholder for now) and
/// provides quick access to Start New Trip, Report Incident, and Panic.
///
/// Google Maps integration (M-07) is deferred to Slice 8.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme.dart';
import '../../../app/router.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Map placeholder (Google Maps will replace this in Slice 8).
          Container(
            color: const Color(0xFFE8ECF1),
            child: const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.map_outlined, size: 64, color: Color(0xFF94A3B8)),
                  SizedBox(height: 12),
                  Text(
                    'Map View',
                    style: TextStyle(
                      fontSize: 18,
                      color: Color(0xFF64748B),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Live safety map coming soon',
                    style: TextStyle(color: Color(0xFF94A3B8)),
                  ),
                ],
              ),
            ),
          ),

          // Bottom sheet — trip status + Start button
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                boxShadow: [
                  BoxShadow(
                    color: Color(0x1A000000),
                    blurRadius: 12,
                    offset: Offset(0, -4),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Drag handle
                  Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: const Color(0xFFE2E8F0),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // No active trip
                  Text(
                    'No active trip',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Start monitoring your journey',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppColors.darkSlate.withValues(alpha: 0.6),
                        ),
                  ),
                  const SizedBox(height: 16),

                  // Start New Trip button
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: FilledButton.icon(
                      onPressed: () => context.push(AppRoutes.tripRegistration),
                      icon: const Icon(Icons.play_arrow),
                      label: const Text('Start New Trip'),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.safetyGreen,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
