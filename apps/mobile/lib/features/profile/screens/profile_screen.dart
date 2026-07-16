/// Profile Screen — user profile info and emergency contacts management.
library profile_screen;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../auth/cubit/auth_cubit.dart';
import '../cubit/profile_cubit.dart';
import '../../../app/theme.dart';
import '../../../app/router.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _fullNameController = TextEditingController();
  final _phoneController = TextEditingController();

  @override
  void initState() {
    super.initState();
    context.read<ProfileCubit>().loadProfile();
  }

  @override
  void dispose() {
    _fullNameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<ProfileCubit, ProfileState>(
      listenWhen: (previous, current) =>
          previous.status != current.status &&
          current.status == ProfileStatus.error,
      listener: (context, state) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(state.errorMessage ?? 'An error occurred'),
            backgroundColor: AppColors.emergencyRed,
          ),
        );
        // Reset error so it doesn't fire again on subsequent rebuilds
        context.read<ProfileCubit>().clearError();
      },
      builder: (context, state) {
        if (state.status == ProfileStatus.loading) {
          return Scaffold(
            appBar: AppBar(title: const Text('Profile & Settings')),
            body: const Center(child: CircularProgressIndicator()),
          );
        }

        // Sync controllers when data arrives
        if (state.fullName.isNotEmpty && _fullNameController.text.isEmpty) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && _fullNameController.text.isEmpty) {
              _fullNameController.text = state.fullName;
            }
          });
        }
        if (_phoneController.text.isEmpty && state.phone != null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && _phoneController.text.isEmpty) {
              _phoneController.text = state.phone ?? '';
            }
          });
        }

        return Scaffold(
          appBar: AppBar(title: const Text('Profile & Settings')),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildProfileSection(context, state),
                const SizedBox(height: 24),
                _buildEmergencyContacts(context, state),
                const SizedBox(height: 24),
                _buildOrgMembershipSection(context, state),
                const SizedBox(height: 24),
                _buildNotificationPrefs(context, state),
                const SizedBox(height: 32),
                _buildSaveButton(context, state),
                const SizedBox(height: 12),
                _buildSignOutButton(context),
                const SizedBox(height: 24),
                const Divider(),
                const SizedBox(height: 12),
                _buildAccountDeletionSection(context, state),
                const SizedBox(height: 40),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildProfileSection(BuildContext context, ProfileState state) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionHeader(title: 'Profile Information'),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                TextField(
                  controller: _fullNameController,
                  decoration: const InputDecoration(
                    labelText: 'Full Name',
                    prefixIcon: Icon(Icons.person_outline),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'Phone Number',
                    hintText: '+2348012345678',
                    helperText: 'Used to reach out to you when you\'re offline',
                    prefixIcon: Icon(Icons.phone_outlined),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildEmergencyContacts(BuildContext context, ProfileState state) {
    final cubit = context.read<ProfileCubit>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionHeader(title: 'Emergency Contacts'),
        const SizedBox(height: 4),
        Text(
          'At least one contact with a phone number is required. '
          'These contacts will be notified if you trigger an emergency.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: AppColors.darkSlate.withValues(alpha: 0.6),
          ),
        ),
        const SizedBox(height: 12),
        ...state.contacts.asMap().entries.map((entry) {
          return _EmergencyContactCard(
            index: entry.key,
            contact: entry.value,
            onChanged: (updated) => cubit.updateContact(entry.key, updated),
            onRemove: () => cubit.removeContact(entry.key),
          );
        }),
        if (state.contacts.length < 3)
          OutlinedButton.icon(
            onPressed: cubit.addContact,
            icon: const Icon(Icons.add),
            label: const Text('Add Emergency Contact'),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(double.infinity, 48),
            ),
          ),
      ],
    );
  }

  Widget _buildOrgMembershipSection(BuildContext context, ProfileState state) {
    final cubit = context.read<ProfileCubit>();
    final membership = state.orgMembership;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionHeader(title: 'Organisation Membership'),
        const SizedBox(height: 12),
        if (membership == null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'You are not currently a member of any organisation.',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: AppColors.darkSlate.withValues(alpha: 0.7),
                        ),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () => context.push(AppRoutes.joinOrg),
                    icon: const Icon(Icons.group_add_outlined),
                    label: const Text('Join an Organisation'),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 44),
                    ),
                  ),
                ],
              ),
            ),
          )
        else
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.business_outlined,
                        color: AppColors.safetyGreen,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          membership.orgName,
                          style: Theme.of(context)
                              .textTheme
                              .titleSmall
                              ?.copyWith(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                  if (membership.orgType.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      membership.orgType,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: AppColors.darkSlate.withValues(alpha: 0.5),
                          ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Text(
                    'Member since ${_formatDate(membership.memberSince)}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppColors.darkSlate.withValues(alpha: 0.6),
                        ),
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton(
                    onPressed: state.status == ProfileStatus.saving
                        ? null
                        : () => _confirmLeaveOrg(context, cubit, membership.orgName),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.emergencyRed,
                      side: const BorderSide(color: AppColors.emergencyRed),
                      minimumSize: const Size(double.infinity, 44),
                    ),
                    child: const Text('Leave Organisation'),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  String _formatDate(DateTime date) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${months[date.month - 1]} ${date.day}, ${date.year}';
  }

  Future<void> _confirmLeaveOrg(
    BuildContext context,
    ProfileCubit cubit,
    String orgName,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave Organisation?'),
        content: Text(
          'Are you sure you want to leave $orgName? '
          'You will no longer receive org-covered trip monitoring.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(
              foregroundColor: AppColors.emergencyRed,
            ),
            child: const Text('Leave'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      cubit.leaveOrg();
    }
  }

  Widget _buildNotificationPrefs(BuildContext context, ProfileState state) {
    final cubit = context.read<ProfileCubit>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionHeader(title: 'Notification Preferences'),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                SwitchListTile(
                  title: const Text('Push Notifications'),
                  subtitle: const Text('Receive alerts and messages'),
                  value: state.pushEnabled,
                  onChanged: cubit.setPushEnabled,
                ),
                const Divider(height: 1),
                SwitchListTile(
                  title: const Text('Email Notifications'),
                  subtitle: const Text('Receive trip reports and alerts'),
                  value: state.emailEnabled,
                  onChanged: cubit.setEmailEnabled,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSaveButton(BuildContext context, ProfileState state) {
    final isSaving = state.status == ProfileStatus.saving;
    return ElevatedButton(
      onPressed:
          isSaving
              ? null
              : () {
                context.read<ProfileCubit>().saveProfile(
                  fullName: _fullNameController.text.trim(),
                  phone:
                      _phoneController.text.trim().isEmpty
                          ? null
                          : _phoneController.text.trim(),
                  contacts: state.contacts.map((c) => c.toJson()).toList(),
                  pushEnabled: state.pushEnabled,
                  emailEnabled: state.emailEnabled,
                );
              },
      child:
          isSaving
              ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
              : const Text('Save Changes'),
    );
  }

  /// M-38 Account Deletion — screens.md Screen 7's "Delete My Account"
  /// element. Shows a scheduled-deletion / legal-hold banner with a Cancel
  /// Deletion action if a request is already in flight; otherwise shows the
  /// destructive "Delete My Account" text action that navigates to Screen 7a.
  Widget _buildAccountDeletionSection(BuildContext context, ProfileState state) {
    final request = state.deletionRequest;

    if (request != null && request.showsBanner) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.emergencyRed.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.emergencyRed.withValues(alpha: 0.3)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              request.isLegalHold
                  ? 'Your deletion is on hold pending resolution of an open safety matter — no action needed from you.'
                  : 'Account scheduled for deletion on ${_formatDate(request.scheduledFor)}.',
              style: TextStyle(color: AppColors.emergencyRed),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: state.status == ProfileStatus.saving
                  ? null
                  : () => _confirmCancelDeletion(context),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.emergencyRed,
                side: BorderSide(color: AppColors.emergencyRed),
              ),
              child: const Text('Cancel Deletion'),
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Permanently close your SafePass account. Your profile, name, and '
          'contact details are removed; trip history, payments, and safety '
          'reports are kept (with your personal details removed from them) '
          'for legal and financial record-keeping. Requests are processed '
          'after a 14-day cooling-off period, which you can cancel at any '
          'time — you\'ll see a countdown banner here until then.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: AppColors.darkSlate.withValues(alpha: 0.6),
              ),
        ),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: () => context.push(AppRoutes.deleteAccount),
            style: TextButton.styleFrom(foregroundColor: AppColors.emergencyRed),
            child: const Text('Delete My Account'),
          ),
        ),
      ],
    );
  }

  Future<void> _confirmCancelDeletion(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel your scheduled account deletion?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Back'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Cancel Deletion'),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      context.read<ProfileCubit>().cancelDeletionRequest();
    }
  }

  Widget _buildSignOutButton(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton(
        onPressed: () => context.read<AuthCubit>().signOut(),
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.emergencyRed,
          side: const BorderSide(color: AppColors.emergencyRed),
        ),
        child: const Text('Sign Out'),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: Theme.of(context).textTheme.titleMedium?.copyWith(
        fontWeight: FontWeight.w600,
        color: AppColors.darkSlate,
      ),
    );
  }
}

class _EmergencyContactCard extends StatefulWidget {
  final int index;
  final EmergencyContactModel contact;
  final ValueChanged<EmergencyContactModel> onChanged;
  final VoidCallback onRemove;

  const _EmergencyContactCard({
    required this.index,
    required this.contact,
    required this.onChanged,
    required this.onRemove,
  });

  @override
  State<_EmergencyContactCard> createState() => _EmergencyContactCardState();
}

class _EmergencyContactCardState extends State<_EmergencyContactCard> {
  late final TextEditingController _nameController;
  late final TextEditingController _relationshipController;
  late final TextEditingController _phoneController;
  late final TextEditingController _emailController;

  @override
  void initState() {
    super.initState();
    final c = widget.contact;
    _nameController = TextEditingController(text: c.name);
    _relationshipController = TextEditingController(text: c.relationship);
    _phoneController = TextEditingController(text: c.phone);
    _emailController = TextEditingController(text: c.email);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _relationshipController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  void _emitChange() {
    widget.onChanged(
      EmergencyContactModel(
        name: _nameController.text,
        relationship:
            _relationshipController.text.isEmpty
                ? null
                : _relationshipController.text,
        phone: _phoneController.text,
        phoneWhatsappEnabled: widget.contact.phoneWhatsappEnabled,
        email: _emailController.text.isEmpty ? null : _emailController.text,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  'Contact ${widget.index + 1}',
                  style: Theme.of(
                    context,
                  ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                ),
                const Spacer(),
                IconButton(
                  onPressed: widget.onRemove,
                  icon: const Icon(
                    Icons.delete_outline,
                    color: AppColors.emergencyRed,
                  ),
                  iconSize: 20,
                  tooltip: 'Remove contact',
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _nameController,
              onChanged: (_) => _emitChange(),
              decoration: const InputDecoration(
                labelText: 'Full Name *',
                hintText: 'e.g., Jane Doe',
                prefixIcon: Icon(Icons.person_outline, size: 20),
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _relationshipController,
              onChanged: (_) => _emitChange(),
              decoration: const InputDecoration(
                labelText: 'Relationship',
                hintText: 'e.g., Spouse, Parent, Sibling',
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _phoneController,
              onChanged: (_) => _emitChange(),
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Phone Number *',
                hintText: '+2348012345678',
                prefixIcon: Icon(Icons.phone_outlined, size: 20),
              ),
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              title: const Text('WhatsApp enabled'),
              value: widget.contact.phoneWhatsappEnabled,
              onChanged:
                  (val) => widget.onChanged(
                    widget.contact.copyWith(phoneWhatsappEnabled: val),
                  ),
              dense: true,
              contentPadding: EdgeInsets.zero,
            ),
            TextField(
              controller: _emailController,
              onChanged: (_) => _emitChange(),
              decoration: const InputDecoration(
                labelText: 'Email (Optional)',
                hintText: 'contact@email.com',
                prefixIcon: Icon(Icons.email_outlined, size: 20),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
