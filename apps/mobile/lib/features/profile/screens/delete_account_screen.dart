/// Delete Account Screen (7a) — M-38 Account Deletion confirmation flow.
///
/// Implements screens.md Screen 7a's step sequence: warning -> conditional
/// re-auth -> typed "DELETE" confirmation -> pre-flight error handling ->
/// success. Reached from Screen 7 (Profile & Settings)'s "Delete My Account"
/// action.
library delete_account_screen;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../auth/cubit/auth_cubit.dart';
import '../cubit/delete_account_cubit.dart';
import '../../../app/theme.dart';
import '../../../app/router.dart';

class DeleteAccountScreen extends StatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  State<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends State<DeleteAccountScreen> {
  final _confirmationController = TextEditingController();

  @override
  void initState() {
    super.initState();
    context.read<DeleteAccountCubit>().checkReauthRequirement();
  }

  @override
  void dispose() {
    _confirmationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Delete My Account')),
      body: BlocConsumer<DeleteAccountCubit, DeleteAccountState>(
        listener: (context, state) {
          if (state.status == DeleteAccountStatus.error) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.errorMessage ?? 'Something went wrong'),
                backgroundColor: AppColors.emergencyRed,
              ),
            );
          }
        },
        builder: (context, state) {
          if (state.status == DeleteAccountStatus.success) {
            return _SuccessStep(scheduledFor: state.scheduledFor);
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _WarningCard(),
                const SizedBox(height: 20),
                if (state.needsReauth && !state.reauthAcknowledged)
                  _ReauthCard(
                    onContinue: () async {
                      // Re-authentication simplification (see
                      // delete_account_cubit.dart doc comment): route
                      // through the app's existing sign-out + sign-in flow
                      // uniformly across all four auth providers, rather
                      // than four bespoke reauthenticateWithCredential UIs.
                      await context.read<AuthCubit>().signOut();
                      if (context.mounted) context.go(AppRoutes.login);
                    },
                  )
                else ...[
                  _TypedConfirmationCard(
                    controller: _confirmationController,
                    onChanged: (v) =>
                        context.read<DeleteAccountCubit>().setTypedConfirmation(v),
                  ),
                  if (state.status == DeleteAccountStatus.preFlightBlocked)
                    _PreFlightErrorCard(message: state.errorMessage),
                  if (state.status == DeleteAccountStatus.requiresWalletForfeit)
                    _WalletForfeitCard(
                      message: state.errorMessage,
                      value: state.forfeitWalletBalance,
                      onChanged: (v) => context
                          .read<DeleteAccountCubit>()
                          .setForfeitWalletBalance(v),
                    ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: state.canSubmit
                          ? () => context.read<DeleteAccountCubit>().submit()
                          : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.emergencyRed,
                        foregroundColor: Colors.white,
                      ),
                      child: state.status == DeleteAccountStatus.submitting
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Delete My Account'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => context.pop(),
                      child: const Text('Cancel, keep my account'),
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _WarningCard extends StatelessWidget {
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
                Icon(Icons.warning_amber_rounded, color: AppColors.emergencyRed),
                const SizedBox(width: 8),
                Text(
                  'This will schedule your account for deletion',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const Text(
              'Your profile, name, and contact details will be removed. Your '
              'trip history, payments, and safety reports are kept for legal '
              'and financial record-keeping, with your personal details '
              'removed from them. This can take up to 14 days, during which '
              'you can cancel any time.',
            ),
          ],
        ),
      ),
    );
  }
}

class _ReauthCard extends StatelessWidget {
  final VoidCallback onContinue;
  const _ReauthCard({required this.onContinue});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'For your security, please sign in again before deleting your '
              'account.',
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: onContinue,
                child: const Text('Sign In Again'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TypedConfirmationCard extends StatelessWidget {
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  const _TypedConfirmationCard({required this.controller, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Type DELETE to confirm.',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          onChanged: onChanged,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(
            hintText: 'DELETE',
            border: OutlineInputBorder(),
          ),
        ),
      ],
    );
  }
}

class _PreFlightErrorCard extends StatelessWidget {
  final String? message;
  const _PreFlightErrorCard({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.emergencyRed.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.emergencyRed.withValues(alpha: 0.3)),
      ),
      child: Text(
        message ?? 'Your account cannot be deleted right now.',
        style: TextStyle(color: AppColors.emergencyRed),
      ),
    );
  }
}

class _WalletForfeitCard extends StatefulWidget {
  final String? message;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _WalletForfeitCard({
    required this.message,
    required this.value,
    required this.onChanged,
  });

  @override
  State<_WalletForfeitCard> createState() => _WalletForfeitCardState();
}

class _WalletForfeitCardState extends State<_WalletForfeitCard> {
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.amber.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.amber.withValues(alpha: 0.4)),
      ),
      child: CheckboxListTile(
        controlAffinity: ListTileControlAffinity.leading,
        contentPadding: EdgeInsets.zero,
        value: widget.value,
        onChanged: (v) => widget.onChanged(v ?? false),
        title: Text(widget.message ?? 'I forfeit my remaining wallet balance.'),
      ),
    );
  }
}

class _SuccessStep extends StatelessWidget {
  final DateTime? scheduledFor;
  const _SuccessStep({required this.scheduledFor});

  String _formatDate(DateTime date) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${months[date.month - 1]} ${date.day}, ${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.check_circle_outline, color: AppColors.safetyGreen, size: 56),
            const SizedBox(height: 16),
            Text(
              scheduledFor != null
                  ? 'Your account is scheduled for deletion on ${_formatDate(scheduledFor!)}. You can cancel any time before then from your Profile.'
                  : 'Your account is scheduled for deletion. You can cancel any time before then from your Profile.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => context.go(AppRoutes.profile),
                child: const Text('Done'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
