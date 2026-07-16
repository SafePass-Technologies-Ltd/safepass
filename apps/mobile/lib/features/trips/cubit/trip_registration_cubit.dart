/// Trip Registration Cubit — manages the unified trip creation form state.
///
/// Handles:
/// - GPS-based origin auto-detection
/// - Destination search with debounced autocomplete
/// - Transport company field with skip option
/// - Draft saving and trip starting (with wallet deduction)
/// - Org member tagging (corporate / transport partner members only)
library;

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import '../../../core/api/api_client.dart';
import '../../../core/services/location_helper.dart';

// ────────────────────────────────────────────────────────────
// Models
// ────────────────────────────────────────────────────────────

/// A GPS location with optional place name.
class PlaceLocation extends Equatable {
  final String? name;
  final double latitude;
  final double longitude;

  const PlaceLocation({
    this.name,
    required this.latitude,
    required this.longitude,
  });

  factory PlaceLocation.fromJson(Map<String, dynamic> json) => PlaceLocation(
        name: json['name'] as String?,
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
      );

  Map<String, dynamic> toJson() => {
        if (name != null) 'name': name,
        'latitude': latitude,
        'longitude': longitude,
      };

  @override
  List<Object?> get props => [name, latitude, longitude];
}

/// A fellow org member that can be tagged on a trip.
class OrgMemberModel extends Equatable {
  final String userId;
  final String fullName;
  final String? phone;

  const OrgMemberModel({
    required this.userId,
    required this.fullName,
    this.phone,
  });

  factory OrgMemberModel.fromJson(Map<String, dynamic> json) => OrgMemberModel(
        userId: json['userId'] as String? ?? json['id'] as String,
        fullName: json['fullName'] as String? ?? json['name'] as String? ?? '',
        phone: json['phone'] as String?,
      );

  @override
  List<Object?> get props => [userId, fullName, phone];
}

/// A distinct past destination, returned by
/// `GET /v1/trips/destinations/recent`. Powers the "Recent destinations"
/// quick-pick list in the "Where to?" sheet so the user can reuse a
/// previously-travelled-to place without retyping/re-searching it.
class RecentDestinationModel extends Equatable {
  final PlaceLocation destination;
  final String lastTripId;
  final DateTime lastTravelledAt;

  const RecentDestinationModel({
    required this.destination,
    required this.lastTripId,
    required this.lastTravelledAt,
  });

  factory RecentDestinationModel.fromJson(Map<String, dynamic> json) =>
      RecentDestinationModel(
        destination: PlaceLocation.fromJson(
            json['destination'] as Map<String, dynamic>),
        lastTripId: json['lastTripId'] as String,
        lastTravelledAt:
            DateTime.parse(json['lastTravelledAt'] as String),
      );

  @override
  List<Object?> get props => [destination, lastTripId, lastTravelledAt];
}

/// A place suggestion returned from the geocoding autocomplete API.
class PlaceSuggestion {
  final String placeId;
  final String name;
  final String? secondaryText;
  final String description;

  const PlaceSuggestion({
    required this.placeId,
    required this.name,
    this.secondaryText,
    required this.description,
  });

  factory PlaceSuggestion.fromJson(Map<String, dynamic> json) =>
      PlaceSuggestion(
        placeId: json['placeId'] as String,
        name: json['mainText'] as String? ?? json['description'] as String,
        secondaryText: json['secondaryText'] as String?,
        description: json['description'] as String,
      );
}

// ────────────────────────────────────────────────────────────
// State
// ────────────────────────────────────────────────────────────

enum TripFormStatus {
  initial,
  submitting,
  started,
  draftSaved,
  error,
}

class TripRegistrationState extends Equatable {
  final TripFormStatus status;
  final PlaceLocation? origin;
  final PlaceLocation? destination;
  final String? vehiclePlateNumber;
  final String? vehicleDescription;
  final String? transportCompany;
  final bool transportCompanySkipped;
  /// True when the caller is a transport_partner — transport company is
  /// pre-filled server-side and the field is read-only on the form.
  final bool isTransportPartner;
  final String? errorMessage;
  final String? startedTripId;

  // GPS origin state
  final bool isGpsLocating;
  final bool isGpsDenied;
  final bool isGpsTimeout;

  // Destination autocomplete state
  final List<PlaceSuggestion> destinationSuggestions;
  final bool isSearchingDestination;

  // Org membership
  final bool isOrgMember;

  /// The user's org ID — needed to fetch the member list for tagging.
  final String? orgId;

  /// Members the user has chosen to tag on this trip.
  final List<OrgMemberModel> taggedMembers;

  const TripRegistrationState({
    this.status = TripFormStatus.initial,
    this.origin,
    this.destination,
    this.vehiclePlateNumber,
    this.vehicleDescription,
    this.transportCompany,
    this.transportCompanySkipped = false,
    this.isTransportPartner = false,
    this.errorMessage,
    this.startedTripId,
    this.isGpsLocating = false,
    this.isGpsDenied = false,
    this.isGpsTimeout = false,
    this.destinationSuggestions = const [],
    this.isSearchingDestination = false,
    this.isOrgMember = false,
    this.orgId,
    this.taggedMembers = const [],
  });

  /// Whether the form can be submitted.
  bool get isFormValid => origin != null && destination != null;

  /// Whether the "Tag a member" action is available.
  /// Requires a plate number to be entered before tagging is allowed.
  bool get canTagMember =>
      vehiclePlateNumber != null && vehiclePlateNumber!.trim().isNotEmpty;

  TripRegistrationState copyWith({
    TripFormStatus? status,
    PlaceLocation? origin,
    PlaceLocation? destination,
    String? vehiclePlateNumber,
    String? vehicleDescription,
    String? transportCompany,
    bool? transportCompanySkipped,
    bool? isTransportPartner,
    String? errorMessage,
    String? startedTripId,
    bool? isGpsLocating,
    bool? isGpsDenied,
    bool? isGpsTimeout,
    List<PlaceSuggestion>? destinationSuggestions,
    bool? isSearchingDestination,
    bool? isOrgMember,
    String? orgId,
    List<OrgMemberModel>? taggedMembers,
    bool clearOrigin = false,
    bool clearDestination = false,
    bool clearVehiclePlateNumber = false,
    bool clearVehicleDescription = false,
    bool clearTransportCompany = false,
    bool clearError = false,
  }) {
    return TripRegistrationState(
      status: status ?? this.status,
      origin: clearOrigin ? null : (origin ?? this.origin),
      destination:
          clearDestination ? null : (destination ?? this.destination),
      vehiclePlateNumber: clearVehiclePlateNumber
          ? null
          : (vehiclePlateNumber ?? this.vehiclePlateNumber),
      vehicleDescription: clearVehicleDescription
          ? null
          : (vehicleDescription ?? this.vehicleDescription),
      transportCompany: clearTransportCompany
          ? null
          : (transportCompany ?? this.transportCompany),
      transportCompanySkipped:
          transportCompanySkipped ?? this.transportCompanySkipped,
      isTransportPartner: isTransportPartner ?? this.isTransportPartner,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      startedTripId: startedTripId ?? this.startedTripId,
      isGpsLocating: isGpsLocating ?? this.isGpsLocating,
      isGpsDenied: isGpsDenied ?? this.isGpsDenied,
      isGpsTimeout: isGpsTimeout ?? this.isGpsTimeout,
      destinationSuggestions:
          destinationSuggestions ?? this.destinationSuggestions,
      isSearchingDestination:
          isSearchingDestination ?? this.isSearchingDestination,
      isOrgMember: isOrgMember ?? this.isOrgMember,
      orgId: orgId ?? this.orgId,
      taggedMembers: taggedMembers ?? this.taggedMembers,
    );
  }

  @override
  List<Object?> get props => [
        status,
        origin,
        destination,
        vehiclePlateNumber,
        vehicleDescription,
        transportCompany,
        transportCompanySkipped,
        isTransportPartner,
        errorMessage,
        startedTripId,
        isGpsLocating,
        isGpsDenied,
        isGpsTimeout,
        destinationSuggestions,
        isSearchingDestination,
        isOrgMember,
        orgId,
        taggedMembers,
      ];
}

// ────────────────────────────────────────────────────────────
// Cubit
// ────────────────────────────────────────────────────────────

class TripRegistrationCubit extends Cubit<TripRegistrationState> {
  TripRegistrationCubit() : super(const TripRegistrationState());

  final _dio = ApiClient.instance.dio;
  Timer? _destinationDebounce;

  // ── GPS origin detection ──────────────────────────────────

  /// Detect current location and reverse-geocode it to an address.
  Future<void> detectLocation() async {
    emit(state.copyWith(
      isGpsLocating: true,
      isGpsDenied: false,
      isGpsTimeout: false,
      clearError: true,
    ));

    try {
      // Check / request permission
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.deniedForever ||
          permission == LocationPermission.denied) {
        emit(state.copyWith(isGpsLocating: false, isGpsDenied: true));
        return;
      }

      // Get position quickly -- prefers a fresh fix but falls back to the
      // last known cached position if one isn't ready within 15s, instead
      // of either hanging indefinitely or throwing "GPS timed out" after
      // only 8s (too short for a cold GPS fix, especially indoors).
      final position = await getQuickPosition();

      // Reverse-geocode via our API
      try {
        final response = await _dio.get(
          '/v1/geocoding/reverse',
          queryParameters: {
            'lat': position.latitude,
            'lng': position.longitude,
          },
        );
        final data = response.data['data'] as Map<String, dynamic>? ?? {};
        final name = data['address'] as String? ??
            '${position.latitude.toStringAsFixed(5)}, '
                '${position.longitude.toStringAsFixed(5)}';

        emit(state.copyWith(
          isGpsLocating: false,
          origin: PlaceLocation(
            name: name,
            latitude: (data['lat'] as num?)?.toDouble() ?? position.latitude,
            longitude: (data['lng'] as num?)?.toDouble() ?? position.longitude,
          ),
        ));
      } catch (_) {
        // Reverse-geocode failed — use coordinates as fallback
        emit(state.copyWith(
          isGpsLocating: false,
          origin: PlaceLocation(
            name:
                '${position.latitude.toStringAsFixed(5)}, ${position.longitude.toStringAsFixed(5)}',
            latitude: position.latitude,
            longitude: position.longitude,
          ),
        ));
      }
    } on TimeoutException {
      emit(state.copyWith(isGpsLocating: false, isGpsTimeout: true));
    } on LocationServiceDisabledException {
      emit(state.copyWith(isGpsLocating: false, isGpsDenied: true));
    } catch (_) {
      emit(state.copyWith(isGpsLocating: false, isGpsTimeout: true));
    }
  }

  // ── Field setters ─────────────────────────────────────────

  /// Set origin location (manual edit).
  void setOrigin(PlaceLocation location) {
    emit(state.copyWith(origin: location));
  }

  /// Set destination location.
  void setDestination(PlaceLocation location) {
    emit(state.copyWith(destination: location));
  }

  /// Set vehicle plate number.
  void setVehiclePlateNumber(String? plate) {
    if (plate == null || plate.trim().isEmpty) {
      emit(state.copyWith(clearVehiclePlateNumber: true));
    } else {
      emit(state.copyWith(vehiclePlateNumber: plate.trim()));
    }
  }

  /// Set optional vehicle description.
  void setVehicleDescription(String? description) {
    if (description == null || description.trim().isEmpty) {
      emit(state.copyWith(clearVehicleDescription: true));
    } else {
      emit(state.copyWith(vehicleDescription: description.trim()));
    }
  }

  /// Set transport company name.
  void setTransportCompany(String? company) {
    emit(state.copyWith(transportCompany: company));
  }

  /// Initialise org membership context from the user's profile.
  ///
  /// Call this from the screen's [initState] after reading [ProfileCubit].
  /// Sets [isOrgMember] to true and stores the [orgId] needed for member
  /// lookups. A [null] orgId means the user is not in an org.
  void setOrgMembership({required bool isOrgMember, String? orgId}) {
    emit(state.copyWith(isOrgMember: isOrgMember, orgId: orgId));
  }

  /// Mark the caller as a transport_partner org member so the transport
  /// company field is rendered as read-only and pre-filled server-side.
  void setIsTransportPartner({required bool value}) {
    emit(state.copyWith(isTransportPartner: value));
  }

  /// Replace the list of tagged members (called when the bottom sheet closes).
  void setTaggedMembers(List<OrgMemberModel> members) {
    emit(state.copyWith(taggedMembers: members));
  }

  /// Fetch the list of fellow org members available for tagging.
  ///
  /// Returns an empty list if [orgId] is null or the request fails.
  Future<List<OrgMemberModel>> fetchOrgMembers() async {
    final orgId = state.orgId;
    if (orgId == null || orgId.isEmpty) return [];

    try {
      final response = await _dio.get('/v1/organizations/$orgId/staff');
      final items = response.data['data'] as List<dynamic>? ??
          response.data as List<dynamic>? ??
          [];
      return items
          .map((e) => OrgMemberModel.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }

  /// Fetch the caller's most recent distinct past destinations, for the
  /// "Recent destinations" quick-pick list in the "Where to?" sheet.
  ///
  /// Returns an empty list on failure (e.g. offline) so the sheet can simply
  /// hide the section rather than showing an error for a non-essential
  /// convenience feature.
  Future<List<RecentDestinationModel>> fetchRecentDestinations(
      {int limit = 5}) async {
    try {
      final response = await _dio.get(
        '/v1/trips/destinations/recent',
        queryParameters: {'limit': limit},
      );
      final items = response.data['destinations'] as List<dynamic>? ?? [];
      return items
          .map((e) =>
              RecentDestinationModel.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }

  /// Mark transport company as skipped (hides field).
  void skipTransportCompany() {
    emit(state.copyWith(
      transportCompanySkipped: true,
      clearTransportCompany: true,
    ));
  }

  /// Un-skip transport company (shows field again).
  void unSkipTransportCompany() {
    emit(state.copyWith(transportCompanySkipped: false));
  }

  // ── Destination autocomplete ──────────────────────────────

  /// Search for destination suggestions with 300ms debounce.
  void searchDestination(String query) {
    _destinationDebounce?.cancel();

    if (query.trim().isEmpty) {
      emit(state.copyWith(
        destinationSuggestions: [],
        isSearchingDestination: false,
      ));
      return;
    }

    emit(state.copyWith(isSearchingDestination: true));

    _destinationDebounce = Timer(const Duration(milliseconds: 300), () async {
      try {
        final response = await _dio.get(
          '/v1/geocoding/autocomplete',
          queryParameters: {
            'query': query.trim(),
            if (state.origin != null) 'lat': state.origin!.latitude,
            if (state.origin != null) 'lng': state.origin!.longitude,
          },
        );

        final results = (response.data['data'] as List<dynamic>? ?? [])
            .map((item) =>
                PlaceSuggestion.fromJson(item as Map<String, dynamic>))
            .toList();

        emit(state.copyWith(
          destinationSuggestions: results,
          isSearchingDestination: false,
        ));
      } catch (_) {
        emit(state.copyWith(
          destinationSuggestions: [],
          isSearchingDestination: false,
        ));
      }
    });
  }

  /// Select a destination from suggestions — resolves place ID to lat/lng.
  Future<void> selectDestination(PlaceSuggestion suggestion) async {
    emit(state.copyWith(
      destinationSuggestions: [],
      isSearchingDestination: true,
    ));

    try {
      final response = await _dio.get(
        '/v1/geocoding/place',
        queryParameters: {'placeId': suggestion.placeId},
      );
      final data = response.data['data'] as Map<String, dynamic>;
      emit(state.copyWith(
        destination: PlaceLocation(
          name: data['name'] as String? ?? suggestion.name,
          latitude: (data['lat'] as num).toDouble(),
          longitude: (data['lng'] as num).toDouble(),
        ),
        isSearchingDestination: false,
      ));
    } catch (_) {
      // Place resolve failed — clear suggestions and let user retry
      emit(state.copyWith(isSearchingDestination: false));
    }
  }

  // ── Trip actions ──────────────────────────────────────────

  /// Save the current form as a draft trip.
  Future<void> saveDraft() async {
    if (!state.isFormValid) return;

    emit(state.copyWith(status: TripFormStatus.submitting));

    try {
      final body = _buildCreateBody();
      await _dio.post('/v1/trips', data: body);
      emit(state.copyWith(status: TripFormStatus.draftSaved, clearError: true));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: TripFormStatus.error,
        errorMessage: e.response?.data?['error']?['message'] ??
            'Failed to save draft',
      ));
    }
  }

  /// Create trip and immediately start monitoring.
  Future<void> startTrip() async {
    if (!state.isFormValid) return;

    emit(state.copyWith(status: TripFormStatus.submitting, clearError: true));

    try {
      // 1. Create trip (draft)
      final createBody = _buildCreateBody();
      final createResponse = await _dio.post('/v1/trips', data: createBody);
      final tripId = createResponse.data['id'] as String;

      // 2. Start monitoring (wallet deduction + status → active)
      await _dio.post('/v1/trips/start', data: {'tripId': tripId});

      // 3. Dispatch tag invites for any selected org members.
      //    These are best-effort — a tag failure should not block trip start.
      if (state.taggedMembers.isNotEmpty && state.orgId != null) {
        for (final member in state.taggedMembers) {
          try {
            await _dio.post(
              '/v1/trips/$tripId/tag-invites',
              data: {
                'taggedUserId': member.userId,
                'organizationId': state.orgId,
              },
            );
          } catch (_) {
            // Non-fatal: tag invite failure does not abort the trip.
          }
        }
      }

      emit(state.copyWith(
        status: TripFormStatus.started,
        startedTripId: tripId,
      ));
    } on DioException catch (e) {
      if (e.response?.statusCode == 402) {
        emit(state.copyWith(
          status: TripFormStatus.error,
          errorMessage: 'Insufficient wallet balance. Top up to continue.',
        ));
        return;
      }
      emit(state.copyWith(
        status: TripFormStatus.error,
        errorMessage: e.response?.data?['error']?['message'] ??
            'Failed to start journey',
      ));
    }
  }

  /// Reset to initial state for a new trip.
  void reset() {
    _destinationDebounce?.cancel();
    emit(const TripRegistrationState());
  }

  @override
  Future<void> close() {
    _destinationDebounce?.cancel();
    return super.close();
  }

  // ── Helpers ───────────────────────────────────────────────

  Map<String, dynamic> _buildCreateBody() {
    final Map<String, dynamic> body = {
      'origin': state.origin!.toJson(),
      'destination': state.destination!.toJson(),
    };

    if (state.vehiclePlateNumber != null &&
        state.vehiclePlateNumber!.isNotEmpty) {
      body['vehiclePlateNumber'] = state.vehiclePlateNumber;
    }

    if (state.vehicleDescription != null &&
        state.vehicleDescription!.isNotEmpty) {
      body['vehicleDescription'] = state.vehicleDescription;
    }

    // Transport partner members: don't send transportCompany — the server
    // auto-populates it from the org. For regular members, send it if provided.
    if (!state.isTransportPartner &&
        !state.transportCompanySkipped &&
        state.transportCompany != null &&
        state.transportCompany!.isNotEmpty) {
      body['transportCompany'] = state.transportCompany;
    }

    return body;
  }
}
