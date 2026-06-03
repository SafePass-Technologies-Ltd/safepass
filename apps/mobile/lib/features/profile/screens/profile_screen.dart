/// Profile Screen — user profile info and emergency contacts management.
library profile_screen;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../auth/cubit/auth_cubit.dart';
import '../cubit/profile_cubit.dart';
import '../../../app/theme.dart';

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
                _buildNotificationPrefs(context, state),
                const SizedBox(height: 32),
                _buildSaveButton(context, state),
                const SizedBox(height: 12),
                _buildSignOutButton(context),
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
