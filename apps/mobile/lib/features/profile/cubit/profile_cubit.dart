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

  /// Load the user profile from GET /v1/users/me and org membership.
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

      final hasEmergencyContact = contacts.any(
        (c) => c.name.trim().isNotEmpty && c.phone.trim().isNotEmpty,
      );

      // Fetch org membership. API returns { membership: {...} } when the user
      // belongs to an org, or { membership: null } when they don't. Either
      // response is a 200 — a missing membership is not an error.
      OrgMembership? orgMembership;
      try {
        final orgResponse =
            await ApiClient.instance.dio.get('/v1/org/membership');
        final body = orgResponse.data as Map<String, dynamic>?;
        final membershipJson = body?['membership'] as Map<String, dynamic>?;
        if (membershipJson != null) {
          orgMembership = OrgMembership.fromJson(membershipJson);
        }
      } catch (_) {
        // Network issue or unexpected error — treat as no membership.
        orgMembership = null;
      }

      // M-38: fetch the caller's latest deletion request, if any. Best-effort
      // — a failure here shouldn't block the rest of the profile from loading.
      DeletionRequestSummary? deletionRequest;
      try {
        final delResponse =
            await ApiClient.instance.dio.get('/v1/users/me/deletion-request');
        final delBody = delResponse.data as Map<String, dynamic>?;
        final requestJson = delBody?['request'] as Map<String, dynamic>?;
        if (requestJson != null) {
          deletionRequest = DeletionRequestSummary.fromJson(requestJson);
        }
      } catch (_) {
        deletionRequest = null;
      }

      emit(
        ProfileState(
          status: ProfileStatus.loaded,
          fullName: data['fullName'] as String? ?? '',
          email: data['email'] as String? ?? '',
          phone: data['phone'] as String?,
          contacts: contacts,
          pushEnabled: notifPrefs?['pushEnabled'] as bool? ?? true,
          emailEnabled: notifPrefs?['emailEnabled'] as bool? ?? true,
          hasEmergencyContact: hasEmergencyContact,
          orgMembership: orgMembership,
          deletionRequest: deletionRequest,
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

  /// Leave the current organisation via DELETE /v1/org/membership.
  Future<void> leaveOrg() async {
    emit(state.copyWith(status: ProfileStatus.saving));

    try {
      await ApiClient.instance.dio.delete('/v1/org/membership');
      // Reload to reflect updated state
      await loadProfile();
    } on Exception {
      emit(
        state.copyWith(
          status: ProfileStatus.error,
          errorMessage: 'Failed to leave organisation',
        ),
      );
    }
  }

  /// Cancel a pending/legal_hold deletion request (Flow 10b) via
  /// DELETE /v1/users/me/deletion-request.
  Future<void> cancelDeletionRequest() async {
    emit(state.copyWith(status: ProfileStatus.saving));

    try {
      await ApiClient.instance.dio.delete('/v1/users/me/deletion-request');
      // Reload to reflect the cleared banner state.
      await loadProfile();
    } on Exception {
      emit(
        state.copyWith(
          status: ProfileStatus.error,
          errorMessage: 'Failed to cancel account deletion',
        ),
      );
    }
  }

  /// Save profile changes via PATCH /v1/users/me.
  Future<void> saveProfile({
    String? fullName,
    String? phone,
    List<Map<String, dynamic>>? contacts,
    bool? pushEnabled,
    bool? emailEnabled,
  }) async {
    emit(state.copyWith(status: ProfileStatus.saving));

    try {
      final body = <String, dynamic>{};
      if (fullName != null) body['fullName'] = fullName;
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

  /// Clear the error status and return to loaded state (preserving data).
  void clearError() {
    if (state.status == ProfileStatus.error) {
      emit(state.copyWith(status: ProfileStatus.loaded, errorMessage: null));
    }
  }
}
