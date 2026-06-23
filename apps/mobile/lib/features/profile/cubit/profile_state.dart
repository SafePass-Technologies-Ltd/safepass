part of 'profile_cubit.dart';

/// Profile loading/saving status.
enum ProfileStatus {
  initial,
  loading,
  loaded,
  saving,
  error,
}

/// Organisation membership details.
class OrgMembership extends Equatable {
  final String orgId;
  final String orgName;
  final String orgType;
  final DateTime memberSince;

  const OrgMembership({
    required this.orgId,
    required this.orgName,
    required this.orgType,
    required this.memberSince,
  });

  factory OrgMembership.fromJson(Map<String, dynamic> json) => OrgMembership(
        orgId: json['orgId'] as String? ?? json['id'] as String? ?? '',
        orgName: json['orgName'] as String? ?? json['name'] as String? ?? '',
        orgType: json['orgType'] as String? ?? json['type'] as String? ?? '',
        memberSince: DateTime.tryParse(
                json['memberSince'] as String? ?? json['joinedAt'] as String? ?? '') ??
            DateTime.now(),
      );

  @override
  List<Object?> get props => [orgId, orgName, orgType, memberSince];
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

  /// Whether the server has at least one valid (name + phone) emergency
  /// contact on file as of the last successful load/save. Unlike [contacts]
  /// — which also holds unsaved local edits — this only reflects persisted
  /// state, so it's safe to use as a navigation gate.
  final bool hasEmergencyContact;

  /// Current org membership, or null if not in an org.
  final OrgMembership? orgMembership;

  const ProfileState({
    required this.status,
    this.errorMessage,
    this.fullName = '',
    this.email = '',
    this.phone,
    this.contacts = const [],
    this.pushEnabled = true,
    this.emailEnabled = true,
    this.hasEmergencyContact = false,
    this.orgMembership,
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
        emailEnabled = true,
        hasEmergencyContact = false,
        orgMembership = null;

  ProfileState copyWith({
    ProfileStatus? status,
    String? errorMessage,
    String? fullName,
    String? email,
    String? phone,
    List<EmergencyContactModel>? contacts,
    bool? pushEnabled,
    bool? emailEnabled,
    bool? hasEmergencyContact,
    OrgMembership? orgMembership,
    bool clearOrgMembership = false,
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
      hasEmergencyContact: hasEmergencyContact ?? this.hasEmergencyContact,
      orgMembership:
          clearOrgMembership ? null : (orgMembership ?? this.orgMembership),
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
        hasEmergencyContact,
        orgMembership,
      ];
}
