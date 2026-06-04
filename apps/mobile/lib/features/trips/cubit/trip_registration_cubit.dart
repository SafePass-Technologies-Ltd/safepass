/// Trip Registration Cubit — manages the trip creation form state.
///
/// Handles:
/// - Driver / Passenger mode toggle
/// - Loading saved vehicles (for driver mode)
/// - Location selection (origin, destination)
/// - Draft saving and trip starting (with wallet deduction)
library trip_registration_cubit;

import 'package:dio/dio.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/api/api_client.dart';

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

/// A saved vehicle returned from the API.
class SavedVehicle extends Equatable {
  final String id;
  final String plateNumber;
  final String vehicleType;
  final String? make;
  final String? model;
  final String? colour;
  final bool isDefault;

  const SavedVehicle({
    required this.id,
    required this.plateNumber,
    required this.vehicleType,
    this.make,
    this.model,
    this.colour,
    this.isDefault = false,
  });

  factory SavedVehicle.fromJson(Map<String, dynamic> json) => SavedVehicle(
        id: json['id'] as String,
        plateNumber: json['plateNumber'] as String? ??
            json['plate_number'] as String? ??
            '',
        vehicleType: json['vehicleType'] as String? ??
            json['vehicle_type'] as String? ??
            'car',
        make: json['make'] as String?,
        model: json['model'] as String?,
        colour: json['colour'] as String?,
        isDefault: json['isDefault'] as bool? ?? false,
      );

  @override
  List<Object?> get props => [id, plateNumber, vehicleType, make, model, colour, isDefault];
}

// ────────────────────────────────────────────────────────────
// State
// ────────────────────────────────────────────────────────────

enum TripMode { driver, passenger }

enum TripFormStatus {
  initial,
  loading,
  vehiclesLoaded,
  submitting,
  started,
  draftSaved,
  error,
}

class TripRegistrationState extends Equatable {
  final TripFormStatus status;
  final TripMode tripMode;
  final PlaceLocation? origin;
  final PlaceLocation? destination;
  final String? transportCompany;
  final int passengerCount;
  final List<SavedVehicle> savedVehicles;
  final String? selectedVehicleId;
  final String? driverName;
  final String? driverPhone;
  final String? errorMessage;
  final String? startedTripId;

  const TripRegistrationState({
    this.status = TripFormStatus.initial,
    this.tripMode = TripMode.passenger,
    this.origin,
    this.destination,
    this.transportCompany,
    this.passengerCount = 1,
    this.savedVehicles = const [],
    this.selectedVehicleId,
    this.driverName,
    this.driverPhone,
    this.errorMessage,
    this.startedTripId,
  });

  /// Whether the form can be submitted (origin + destination + mode-specific fields).
  bool get isFormValid {
    if (origin == null || destination == null) return false;
    if (tripMode == TripMode.driver && selectedVehicleId == null) return false;
    return true;
  }

  /// Get the selected vehicle.
  SavedVehicle? get selectedVehicle {
    if (selectedVehicleId == null) return null;
    try {
      return savedVehicles.firstWhere((v) => v.id == selectedVehicleId);
    } catch (_) {
      return null;
    }
  }

  TripRegistrationState copyWith({
    TripFormStatus? status,
    TripMode? tripMode,
    PlaceLocation? origin,
    PlaceLocation? destination,
    String? transportCompany,
    int? passengerCount,
    List<SavedVehicle>? savedVehicles,
    String? selectedVehicleId,
    String? driverName,
    String? driverPhone,
    String? errorMessage,
    String? startedTripId,
    bool clearOrigin = false,
    bool clearDestination = false,
    bool clearTransportCompany = false,
    bool clearSelectedVehicle = false,
    bool clearDriverName = false,
    bool clearDriverPhone = false,
  }) {
    return TripRegistrationState(
      status: status ?? this.status,
      tripMode: tripMode ?? this.tripMode,
      origin: clearOrigin ? null : (origin ?? this.origin),
      destination: clearDestination ? null : (destination ?? this.destination),
      transportCompany:
          clearTransportCompany ? null : (transportCompany ?? this.transportCompany),
      passengerCount: passengerCount ?? this.passengerCount,
      savedVehicles: savedVehicles ?? this.savedVehicles,
      selectedVehicleId:
          clearSelectedVehicle ? null : (selectedVehicleId ?? this.selectedVehicleId),
      driverName: clearDriverName ? null : (driverName ?? this.driverName),
      driverPhone: clearDriverPhone ? null : (driverPhone ?? this.driverPhone),
      errorMessage: errorMessage,
      startedTripId: startedTripId,
    );
  }

  @override
  List<Object?> get props => [
        status,
        tripMode,
        origin,
        destination,
        transportCompany,
        passengerCount,
        savedVehicles,
        selectedVehicleId,
        driverName,
        driverPhone,
        errorMessage,
        startedTripId,
      ];
}

// ────────────────────────────────────────────────────────────
// Cubit
// ────────────────────────────────────────────────────────────

class TripRegistrationCubit extends Cubit<TripRegistrationState> {
  TripRegistrationCubit() : super(const TripRegistrationState());

  final _dio = ApiClient.instance.dio;

  /// Load saved vehicles and auto-detect trip mode.
  Future<void> loadSavedVehicles(String driverName, String? driverPhone) async {
    emit(state.copyWith(status: TripFormStatus.loading));

    try {
      final response = await _dio.get('/v1/users/me/vehicles');
      final List<dynamic> vehiclesJson =
          (response.data['vehicles'] as List<dynamic>?) ?? [];

      final vehicles = vehiclesJson
          .map((v) => SavedVehicle.fromJson(v as Map<String, dynamic>))
          .toList();

      final hasVehicles = vehicles.isNotEmpty;
      final defaultVehicle =
          hasVehicles ? vehicles.firstWhereOrNull((v) => v.isDefault) : null;

      emit(state.copyWith(
        status: TripFormStatus.vehiclesLoaded,
        tripMode: hasVehicles ? TripMode.driver : TripMode.passenger,
        savedVehicles: vehicles,
        selectedVehicleId: defaultVehicle?.id ?? (hasVehicles ? vehicles.first.id : null),
        driverName: driverName,
        driverPhone: driverPhone,
      ));
    } catch (e) {
      emit(state.copyWith(
        status: TripFormStatus.error,
        errorMessage: 'Failed to load your vehicles',
      ));
    }
  }

  /// Toggle between Driver and Passenger mode.
  void setTripMode(TripMode mode) {
    emit(state.copyWith(
      tripMode: mode,
      clearSelectedVehicle: mode == TripMode.passenger,
      clearTransportCompany: mode == TripMode.driver,
    ));
  }

  /// Set origin location.
  void setOrigin(PlaceLocation location) {
    emit(state.copyWith(origin: location));
  }

  /// Set destination location.
  void setDestination(PlaceLocation location) {
    emit(state.copyWith(destination: location));
  }

  /// Set transport company (passenger mode).
  void setTransportCompany(String? company) {
    emit(state.copyWith(transportCompany: company));
  }

  /// Set passenger count.
  void setPassengerCount(int count) {
    emit(state.copyWith(passengerCount: count.clamp(1, 20)));
  }

  /// Select a vehicle (driver mode).
  void selectVehicle(String vehicleId) {
    emit(state.copyWith(selectedVehicleId: vehicleId));
  }

  /// Set driver name (driver mode).
  void setDriverName(String name) {
    emit(state.copyWith(driverName: name));
  }

  /// Set driver phone (driver mode).
  void setDriverPhone(String phone) {
    emit(state.copyWith(driverPhone: phone));
  }

  /// Save the current form as a draft trip.
  Future<void> saveDraft() async {
    if (!state.isFormValid) return;

    emit(state.copyWith(status: TripFormStatus.submitting));

    try {
      final body = _buildCreateBody();
      await _dio.post('/v1/trips', data: body);

      emit(state.copyWith(status: TripFormStatus.draftSaved));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: TripFormStatus.error,
        errorMessage: e.response?.data?['error']?['message'] ?? 'Failed to save draft',
      ));
    }
  }

  /// Save as draft and immediately start monitoring.
  Future<void> startTrip() async {
    if (!state.isFormValid) return;

    emit(state.copyWith(status: TripFormStatus.submitting));

    try {
      // 1. Create trip (draft).
      final createBody = _buildCreateBody();
      final createResponse = await _dio.post('/v1/trips', data: createBody);
      final tripId = createResponse.data['id'] as String;

      // 2. Start monitoring (wallet deduction + status → active).
      await _dio.post('/v1/trips/start', data: {'tripId': tripId});

      emit(state.copyWith(
        status: TripFormStatus.started,
        startedTripId: tripId,
      ));
    } on DioException catch (e) {
      final message = e.response?.data?['error']?['message'];

      // 402 = insufficient balance.
      if (e.response?.statusCode == 402) {
        emit(state.copyWith(
          status: TripFormStatus.error,
          errorMessage: 'Insufficient wallet balance. Top up to continue.',
        ));
        return;
      }

      emit(state.copyWith(
        status: TripFormStatus.error,
        errorMessage: message ?? 'Failed to start trip',
      ));
    }
  }

  /// Build the POST /v1/trips request body.
  Map<String, dynamic> _buildCreateBody() {
    final Map<String, dynamic> body = {
      'userId': '', // Backend sets this from auth context
      'tripMode': state.tripMode == TripMode.driver ? 'driver' : 'passenger',
      'origin': state.origin!.toJson(),
      'destination': state.destination!.toJson(),
    };

    if (state.tripMode == TripMode.driver && state.selectedVehicle != null) {
      final v = state.selectedVehicle!;
      body['userVehicleId'] = v.id;
      body['vehicleType'] = v.vehicleType;
      body['vehiclePlateNumber'] = v.plateNumber;
      body['driverName'] = state.driverName;
      body['driverPhone'] = state.driverPhone;
    }

    if (state.tripMode == TripMode.passenger && state.transportCompany != null) {
      body['transportCompany'] = state.transportCompany;
    }

    if (state.passengerCount > 1) {
      body['passengerCount'] = state.passengerCount;
    }

    return body;
  }

  /// Reset to initial state for a new trip.
  void reset() {
    emit(const TripRegistrationState());
  }
}

/// Extension for firstWhereOrNull (not available in all Dart versions).
extension _FirstWhereOrNull<T> on Iterable<T> {
  T? firstWhereOrNull(bool Function(T) test) {
    for (final element in this) {
      if (test(element)) return element;
    }
    return null;
  }
}
