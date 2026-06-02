/// Onboarding Screen — Post-first-login setup.
///
/// Shown to new users after their first social login.
/// Requires: ToS acceptance, emergency audio recording consent,
/// and at least one emergency contact.
library onboarding_screen;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme.dart';
import '../../../app/router.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  bool _tosAccepted = false;
  bool _recordingConsent = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Welcome to SafePass'),
        automaticallyImplyLeading: false,
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Welcome message
            Text(
              'Before you start, please review and accept the following:',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 32),

            // Terms of Service
            _ConsentCard(
              title: 'Terms of Service',
              description:
                  'I agree to SafePass\'s Terms of Service and Privacy Policy. '
                  'SafePass provides trip monitoring and alerting — it does not '
                  'provide physical security.',
              value: _tosAccepted,
              onChanged: (value) => setState(() => _tosAccepted = value!),
            ),
            const SizedBox(height: 16),

            // Emergency Recording Consent
            _ConsentCard(
              title: 'Emergency Audio Recording Consent',
              description:
                  'I understand that pressing the panic button during a trip will '
                  'activate silent background audio recording. This recording is '
                  'uploaded securely to SafePass for emergency response purposes only.',
              value: _recordingConsent,
              onChanged: (value) => setState(() => _recordingConsent = value!),
            ),
            const SizedBox(height: 16),

            // Info note
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, color: AppColors.primary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'You\'ll set up emergency contacts on the next screen. '
                      'At least one contact is required.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: AppColors.darkSlate,
                          ),
                    ),
                  ),
                ],
              ),
            ),

            const Spacer(),

            // Continue button
            ElevatedButton(
              onPressed: (_tosAccepted && _recordingConsent)
                  ? () => context.go(AppRoutes.profile)
                  : null,
              child: const Text('Continue'),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

/// A card with a checkbox consent item.
class _ConsentCard extends StatelessWidget {
  final String title;
  final String description;
  final bool value;
  final ValueChanged<bool?> onChanged;

  const _ConsentCard({
    required this.title,
    required this.description,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Checkbox(value: value, onChanged: onChanged),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.only(left: 48),
              child: Text(
                description,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppColors.darkSlate.withValues(alpha: 0.7),
                    ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
