/// Onboarding Screen — Post-first-login setup.
///
/// Shown to new users after their first login. Requires:
/// 1. ToS acceptance
/// 2. Emergency audio recording consent
/// 3. Phone number (for social auth users — phone auth users already have it)
/// 4. Emergency contacts (next screen)
library onboarding_screen;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme.dart';
import '../../../app/router.dart';
import '../../../core/api/api_client.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _phoneController = TextEditingController();
  final _phoneFormKey = GlobalKey<FormState>();
  bool _tosAccepted = false;
  bool _recordingConsent = false;
  bool _isSavingPhone = false;

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  /// Whether the user needs to provide a phone number.
  /// Phone auth users have their phone pre-populated; social auth users don't.
  Future<bool> _needsPhone() async {
    try {
      final response = await ApiClient.instance.dio.get('/v1/users/me');
      final phone = response.data['phone'] as String?;
      return phone == null || phone.isEmpty;
    } catch (_) {
      return true; // Assume phone is needed if we can't check
    }
  }

  Future<void> _savePhoneAndProceed() async {
    if (!_phoneFormKey.currentState!.validate()) return;

    setState(() => _isSavingPhone = true);
    try {
      await ApiClient.instance.dio.patch(
        '/v1/users/me',
        data: {'phone': _phoneController.text.trim()},
      );
      if (mounted) {
        context.go(AppRoutes.profile);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to save phone number: $e'),
            backgroundColor: AppColors.emergencyRed,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSavingPhone = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Welcome to SafePass'),
        automaticallyImplyLeading: false,
      ),
      body: FutureBuilder<bool>(
        future: _needsPhone(),
        builder: (context, snapshot) {
          final needsPhone = snapshot.data ?? true;

          return Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Before you start, please review and accept the following:',
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                const SizedBox(height: 24),

                // Phone number (social auth users only)
                if (needsPhone) ...[
                  _buildPhoneField(context),
                  const SizedBox(height: 16),
                ],

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
                  onChanged:
                      (value) => setState(() => _recordingConsent = value!),
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
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AppColors.darkSlate),
                        ),
                      ),
                    ],
                  ),
                ),
                const Spacer(),

                // Continue button
                ElevatedButton(
                  onPressed:
                      _canProceed(needsPhone)
                          ? () async {
                            if (needsPhone) {
                              await _savePhoneAndProceed();
                            } else {
                              context.go(AppRoutes.profile);
                            }
                          }
                          : null,
                  child:
                      _isSavingPhone
                          ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                          : const Text('Continue'),
                ),
                const SizedBox(height: 32),
              ],
            ),
          );
        },
      ),
    );
  }

  bool _canProceed(bool needsPhone) {
    if (!_tosAccepted || !_recordingConsent) return false;
    if (needsPhone && _phoneController.text.trim().isEmpty) return false;
    return true;
  }

  Widget _buildPhoneField(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _phoneFormKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(
                    Icons.phone,
                    color: AppColors.safetyGreen,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Phone Number (Required)',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Padding(
                padding: const EdgeInsets.only(left: 28),
                child: Text(
                  'Your phone number is required for all users. '
                  'It is used for emergency contact and driver identity.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.darkSlate.withValues(alpha: 0.7),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Phone Number',
                  hintText: '+2348012345678',
                  prefixIcon: Icon(Icons.phone_outlined),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Phone number is required';
                  }
                  if (!value.trim().startsWith('+')) {
                    return 'Include country code (e.g., +234)';
                  }
                  return null;
                },
              ),
            ],
          ),
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
