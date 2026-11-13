/// Transient connection notice for the Home shell.
///
/// Shown only while [AuthState.isConnectionDegraded] is true (C-002 r2): the
/// backend is unreachable or failing, but the stored session is intact and
/// the user stays signed in. The copy deliberately reads as a temporary
/// connection problem, never as "your session expired" — a 5xx is not
/// evidence of a dead session.
library;

import 'package:flutter/material.dart';
import '../../../app/theme.dart';

/// Amber strip shown above the bottom navigation while the API is degraded.
class ConnectionDegradedBanner extends StatelessWidget {
  const ConnectionDegradedBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: AppColors.warning100,
      child: const Row(
        children: [
          Icon(
            Icons.cloud_off,
            size: 16,
            color: AppColors.warning700,
          ),
          SizedBox(width: 10),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Connection trouble',
                  style: TextStyle(
                    color: AppColors.darkSlate,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.3,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  "We're having trouble reaching SafePass right now. "
                  "We're trying again, and your details are safe.",
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
