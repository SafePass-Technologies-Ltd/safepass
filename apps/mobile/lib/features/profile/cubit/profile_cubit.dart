/// Profile Cubit — loads and saves user profile data via the SafePass API.
///
/// Fetches the full user profile on load, allows updating phone number,
/// emergency contacts, and notification preferences.
library profile_cubit;

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/api/api_client.dart';

part 'profile_state.dart';

class ProfileCubit extends Cubit<ProfileState> {
  ProfileCubit() : super(const ProfileState.initial());

  /// Load the user profile from GET /v1/users/me.
  Future<void> loadProfile() async {
    emit(state.copyWith(status: ProfileStatus.loading));

    try {
      final response = await ApiClient.instance.dio.get('/v1/users/me');
      final data = response.data as Map<String, dynamic>;

      final contacts = (data['emergencyContacts'] as List<dynamic>?)
              ?.map((c) => EmergencyContactModel(
                    name: c['name'] as String? ?? '',
                    relationship: c['relationship'] as String?,
                    phone: c['phone'] as String? ?? '',
                    phoneWhatsappEnabled:
                        c['phoneWhatsappEnabled'] as bool? ?? false,
                    email: c['email'] as String?,
                  ))
              .toList() ??
          [];

      final notifPrefs =
          data['notificationPreferences'] as Map<String, dynamic>?;

      emit(
        ProfileState(
          status: ProfileStatus.loaded,
          fullName: data['fullName'] as String? ?? '',
          email: data['email'] as String? ?? '',
          phone: data['phone'] as String?,
          contacts: contacts,
          pushEnabled:
              notifPrefs?['pushEnabled'] as bool? ?? true,
          emailEnabled:
              notifPrefs?['emailEnabled'] as bool? ?? true,
        ),
      );
    } on Exception {
      emit(
        state.copyWith(
          status: ProfileStatus.error,
          errorMessage: 'Failed to load profile',
        ),
      );
    }
  }

  /// Save profile changes via PATCH /v1/users/me.
  Future<void> saveProfile({
    String? phone,
    List<Map<String, dynamic>>? contacts,
    bool? pushEnabled,
    bool? emailEnabled,
  }) async {
    emit(state.copyWith(status: ProfileStatus.saving));

    try {
      final body = <String, dynamic>{};
      if (phone != null) body['phone'] = phone;
      if (contacts != null) body['emergencyContacts'] = contacts;
      if (pushEnabled != null || emailEnabled != null) {
        body['notificationPreferences'] = {
          'pushEnabled': pushEnabled ?? state.pushEnabled,
          'emailEnabled': emailEnabled ?? state.emailEnabled,
        };
      }

      await ApiClient.instance.dio.patch('/v1/users/me', data: body);

      // Reload to get the server-confirmed state
      await loadProfile();
    } on Exception {
      emit(
        state.copyWith(
          status: ProfileStatus.error,
          errorMessage: 'Failed to save profile',
        ),
      );
    }
  }

  // ---- Local (optimistic) mutations — no API call ----

  /// Update a single emergency contact in local state.
  void updateContact(int index, EmergencyContactModel contact) {
    final newList = List<EmergencyContactModel>.from(state.contacts);
    if (index >= 0 && index < newList.length) {
      newList[index] = contact;
      emit(state.copyWith(contacts: newList));
    }
  }

  /// Remove an emergency contact from local state.
  void removeContact(int index) {
    if (index >= 0 && index < state.contacts.length) {
      final newList = List<EmergencyContactModel>.from(state.contacts)
        ..removeAt(index);
      emit(state.copyWith(contacts: newList));
    }
  }

  /// Add an empty emergency contact slot (max 3).
  void addContact() {
    if (state.contacts.length < 3) {
      final newList = [
        ...state.contacts,
        const EmergencyContactModel(name: '', phone: ''),
      ];
      emit(state.copyWith(contacts: newList));
    }
  }

  /// Toggle push notifications in local state.
  void setPushEnabled(bool enabled) {
    emit(state.copyWith(pushEnabled: enabled));
  }

  /// Toggle email notifications in local state.
  void setEmailEnabled(bool enabled) {
    emit(state.copyWith(emailEnabled: enabled));
  }
}
