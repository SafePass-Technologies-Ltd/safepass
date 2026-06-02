part of 'profile_cubit.dart';

/// Profile loading/saving status.
enum ProfileStatus {
  initial,
  loading,
  loaded,
  saving,
  error,
}

/// A single emergency contact as returned by the API.
class EmergencyContactModel extends Equatable {
  final String name;
  final String? relationship;
  final String phone;
  final bool phoneWhatsappEnabled;
  final String? email;

  const EmergencyContactModel({
    required this.name,
    this.relationship,
    required this.phone,
    this.phoneWhatsappEnabled = false,
    this.email,
  });

  /// Convert to a JSON-compatible map for the API.
  /// Only includes non-null optional fields — Zod rejects explicit nulls.
  Map<String, dynamic> toJson() {
    final map = <String, dynamic>{
      'name': name,
      'phone': phone,
      'phoneWhatsappEnabled': phoneWhatsappEnabled,
    };
    if (relationship != null) map['relationship'] = relationship;
    if (email != null && email!.isNotEmpty) map['email'] = email;
    return map;
  }

  /// Create a copy with optional field overrides.
  EmergencyContactModel copyWith({
    String? name,
    String? relationship,
    String? phone,
    bool? phoneWhatsappEnabled,
    String? email,
  }) {
    return EmergencyContactModel(
      name: name ?? this.name,
      relationship: relationship ?? this.relationship,
      phone: phone ?? this.phone,
      phoneWhatsappEnabled: phoneWhatsappEnabled ?? this.phoneWhatsappEnabled,
      email: email ?? this.email,
    );
  }

  @override
  List<Object?> get props =>
      [name, relationship, phone, phoneWhatsappEnabled, email];
}

/// State for the ProfileCubit.
class ProfileState extends Equatable {
  final ProfileStatus status;
  final String? errorMessage;
  final String fullName;
  final String email;
  final String? phone;
  final List<EmergencyContactModel> contacts;
  final bool pushEnabled;
  final bool emailEnabled;

  const ProfileState({
    required this.status,
    this.errorMessage,
    this.fullName = '',
    this.email = '',
    this.phone,
    this.contacts = const [],
    this.pushEnabled = true,
    this.emailEnabled = true,
  });

  /// Initial unloaded state.
  const ProfileState.initial()
      : status = ProfileStatus.initial,
        errorMessage = null,
        fullName = '',
        email = '',
        phone = null,
        contacts = const [],
        pushEnabled = true,
        emailEnabled = true;

  ProfileState copyWith({
    ProfileStatus? status,
    String? errorMessage,
    String? fullName,
    String? email,
    String? phone,
    List<EmergencyContactModel>? contacts,
    bool? pushEnabled,
    bool? emailEnabled,
  }) {
    return ProfileState(
      status: status ?? this.status,
      errorMessage: errorMessage,
      fullName: fullName ?? this.fullName,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      contacts: contacts ?? this.contacts,
      pushEnabled: pushEnabled ?? this.pushEnabled,
      emailEnabled: emailEnabled ?? this.emailEnabled,
    );
  }

  @override
  List<Object?> get props => [
        status,
        errorMessage,
        fullName,
        email,
        phone,
        contacts,
        pushEnabled,
        emailEnabled,
      ];
}
