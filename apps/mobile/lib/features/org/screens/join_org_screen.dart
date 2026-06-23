/// Join Org Screen — allows users to redeem an invite token and join an org.
library join_org_screen;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme.dart';
import '../../../app/router.dart';
import '../cubit/join_org_cubit.dart';

class JoinOrgScreen extends StatefulWidget {
  const JoinOrgScreen({super.key});

  @override
  State<JoinOrgScreen> createState() => _JoinOrgScreenState();
}

class _JoinOrgScreenState extends State<JoinOrgScreen> {
  final _tokenController = TextEditingController();
  String? _pendingToken;

  @override
  void dispose() {
    _tokenController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<JoinOrgCubit, JoinOrgState>(
      listener: (context, state) {
        // Nothing special — success is rendered inline
      },
      builder: (context, state) {
        return Scaffold(
          appBar: AppBar(
            title: const Text('Join an Organisation'),
            centerTitle: true,
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: _buildBody(context, state),
          ),
        );
      },
    );
  }

  Widget _buildBody(BuildContext context, JoinOrgState state) {
    switch (state.status) {
      case JoinOrgStatus.success:
        return _buildSuccessView(context, state);
      case JoinOrgStatus.orgFound:
        return _buildConsentView(context, state);
      default:
        return _buildTokenEntryView(context, state);
    }
  }

  // ── Token Entry ───────────────────────────────────────────

  Widget _buildTokenEntryView(BuildContext context, JoinOrgState state) {
    final isLoading = state.status == JoinOrgStatus.resolving;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        const Icon(
          Icons.group_add_outlined,
          size: 56,
          color: AppColors.safetyGreen,
        ),
        const SizedBox(height: 16),
        Text(
          'Enter your invite token',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
                color: AppColors.darkSlate,
              ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          'Your organisation admin will have sent you an invite token. Enter it below to join.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: AppColors.darkSlate.withValues(alpha: 0.65),
              ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 28),
        TextField(
          controller: _tokenController,
          enabled: !isLoading,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(
            labelText: 'Invite Token',
            hintText: 'e.g., SP-ABCD1234',
            prefixIcon: Icon(Icons.vpn_key_outlined),
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),

        // Error banner
        if (state.status == JoinOrgStatus.error &&
            state.errorMessage != null) ...[
          _buildErrorBanner(context, state.errorMessage!),
          const SizedBox(height: 16),
        ],

        FilledButton(
          onPressed: isLoading
              ? null
              : () {
                  final token = _tokenController.text.trim();
                  if (token.isEmpty) return;
                  _pendingToken = token;
                  context.read<JoinOrgCubit>().resolveToken(token);
                },
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.safetyGreen,
            padding: const EdgeInsets.symmetric(vertical: 16),
          ),
          child: isLoading
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Text('Submit'),
        ),
      ],
    );
  }

  // ── Consent View ──────────────────────────────────────────

  Widget _buildConsentView(BuildContext context, JoinOrgState state) {
    final isJoining = state.status == JoinOrgStatus.joining;
    final orgName = state.orgName ?? 'this organisation';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        const Icon(
          Icons.verified_outlined,
          size: 56,
          color: AppColors.safetyGreen,
        ),
        const SizedBox(height: 16),
        Text(
          orgName,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
                color: AppColors.darkSlate,
              ),
          textAlign: TextAlign.center,
        ),
        if (state.orgType != null) ...[
          const SizedBox(height: 4),
          Text(
            state.orgType!,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppColors.darkSlate.withValues(alpha: 0.5),
                ),
            textAlign: TextAlign.center,
          ),
        ],
        const SizedBox(height: 24),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.privacy_tip_outlined,
                      color: AppColors.safetyGreen,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Before you join',
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  'By joining, $orgName will be able to monitor your trip '
                  'activity while you are an active member. You can leave the '
                  'organisation at any time from your Profile.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: AppColors.darkSlate.withValues(alpha: 0.8),
                        height: 1.5,
                      ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),

        // Error banner
        if (state.status == JoinOrgStatus.error &&
            state.errorMessage != null) ...[
          _buildErrorBanner(context, state.errorMessage!),
          const SizedBox(height: 16),
        ],

        FilledButton(
          onPressed: isJoining
              ? null
              : () {
                  if (_pendingToken != null) {
                    context.read<JoinOrgCubit>().acceptAndJoin(_pendingToken!);
                  }
                },
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.safetyGreen,
            padding: const EdgeInsets.symmetric(vertical: 16),
          ),
          child: isJoining
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Text('Accept & Join'),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: isJoining
              ? null
              : () {
                  _tokenController.clear();
                  _pendingToken = null;
                  context.read<JoinOrgCubit>().reset();
                },
          child: const Text('Decline'),
        ),
      ],
    );
  }

  // ── Success View ──────────────────────────────────────────

  Widget _buildSuccessView(BuildContext context, JoinOrgState state) {
    final orgName = state.orgName ?? 'your organisation';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 32),
        const Icon(
          Icons.check_circle_outline,
          size: 72,
          color: AppColors.safetyGreen,
        ),
        const SizedBox(height: 20),
        Text(
          "You're in!",
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: AppColors.darkSlate,
              ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 12),
        Text(
          "You're now a member of $orgName. Trip monitoring is covered by your organisation.",
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: AppColors.darkSlate.withValues(alpha: 0.7),
                height: 1.6,
              ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 40),
        FilledButton(
          onPressed: () => context.go(AppRoutes.home),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.safetyGreen,
            padding: const EdgeInsets.symmetric(vertical: 16),
          ),
          child: const Text('Go to Home'),
        ),
      ],
    );
  }

  // ── Error banner ──────────────────────────────────────────

  Widget _buildErrorBanner(BuildContext context, String message) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.emergencyRed.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.emergencyRed.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, color: AppColors.emergencyRed, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.emergencyRed,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}
