/// Scheduled Trips Cubit — manages the list of calendar/future trips.
///
/// Handles create, list (with filter), update, and cancel operations
/// against /v1/trips/scheduled.
library scheduled_trips_cubit;

import 'package:dio/dio.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/api/api_client.dart';
import 'trip_registration_cubit.dart' show PlaceLocation;

// ────────────────────────────────────────────────────────────
// Models
// ────────────────────────────────────────────────────────────

/// Status values that mirror the backend enum.
enum ScheduledTripStatus { upcoming, missed, started, cancelled }

extension ScheduledTripStatusX on ScheduledTripStatus {
  String get label {
    switch (this) {
      case ScheduledTripStatus.upcoming:
        return 'Upcoming';
      case ScheduledTripStatus.missed:
        return 'Missed';
      case ScheduledTripStatus.started:
        return 'Started';
      case ScheduledTripStatus.cancelled:
        return 'Cancelled';
    }
  }

  static ScheduledTripStatus fromString(String s) {
    switch (s) {
      case 'missed':
        return ScheduledTripStatus.missed;
      case 'started':
        return ScheduledTripStatus.started;
      case 'cancelled':
        return ScheduledTripStatus.cancelled;
      default:
        return ScheduledTripStatus.upcoming;
    }
  }
}

/// A single scheduled trip as returned by the API.
class ScheduledTrip extends Equatable {
  final String id;
  final PlaceLocation destination;
  final DateTime scheduledAt;
  final String? label;
  final String? transportCompany;
  final String? vehicleType;
  final String? vehiclePlateNumber;
  final ScheduledTripStatus status;

  const ScheduledTrip({
    required this.id,
    required this.destination,
    required this.scheduledAt,
    this.label,
    this.transportCompany,
    this.vehicleType,
    this.vehiclePlateNumber,
    required this.status,
  });

  factory ScheduledTrip.fromJson(Map<String, dynamic> json) {
    final dest = json['destination'] as Map<String, dynamic>;
    final vehicle = json['vehicle'] as Map<String, dynamic>?;
    return ScheduledTrip(
      id: json['id'] as String,
      destination: PlaceLocation(
        name: dest['name'] as String?,
        latitude: (dest['lat'] as num).toDouble(),
        longitude: (dest['lng'] as num).toDouble(),
      ),
      scheduledAt: DateTime.parse(json['scheduledAt'] as String),
      label: json['label'] as String?,
      transportCompany: vehicle?['transport_company'] as String?,
      vehicleType: vehicle?['type'] as String?,
      vehiclePlateNumber: vehicle?['plate_number'] as String?,
      status: ScheduledTripStatusX.fromString(json['status'] as String),
    );
  }

  @override
  List<Object?> get props => [
        id,
        destination,
        scheduledAt,
        label,
        transportCompany,
        vehicleType,
        vehiclePlateNumber,
        status,
      ];
}

// ────────────────────────────────────────────────────────────
// Filter tabs
// ────────────────────────────────────────────────────────────

enum ScheduledTripFilter { upcoming, missed, past }

extension ScheduledTripFilterX on ScheduledTripFilter {
  String get label {
    switch (this) {
      case ScheduledTripFilter.upcoming:
        return 'Upcoming';
      case ScheduledTripFilter.missed:
        return 'Missed';
      case ScheduledTripFilter.past:
        return 'Past';
    }
  }

  String get queryParam {
    switch (this) {
      case ScheduledTripFilter.upcoming:
        return 'upcoming';
      case ScheduledTripFilter.missed:
        return 'missed';
      case ScheduledTripFilter.past:
        return 'past';
    }
  }
}

// ────────────────────────────────────────────────────────────
// State
// ────────────────────────────────────────────────────────────

enum ScheduledTripsStatus { initial, loading, loaded, error }

class ScheduledTripsState extends Equatable {
  final ScheduledTripsStatus status;
  final List<ScheduledTrip> trips;
  final ScheduledTripFilter filter;
  final String? errorMessage;

  /// Set to true while a create/update/cancel request is in flight.
  final bool isMutating;

  /// ID of a trip that was just created — used to confirm success.
  final String? lastCreatedId;

  const ScheduledTripsState({
    this.status = ScheduledTripsStatus.initial,
    this.trips = const [],
    this.filter = ScheduledTripFilter.upcoming,
    this.errorMessage,
    this.isMutating = false,
    this.lastCreatedId,
  });

  ScheduledTripsState copyWith({
    ScheduledTripsStatus? status,
    List<ScheduledTrip>? trips,
    ScheduledTripFilter? filter,
    String? errorMessage,
    bool? isMutating,
    String? lastCreatedId,
    bool clearError = false,
    bool clearLastCreated = false,
  }) {
    return ScheduledTripsState(
      status: status ?? this.status,
      trips: trips ?? this.trips,
      filter: filter ?? this.filter,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      isMutating: isMutating ?? this.isMutating,
      lastCreatedId:
          clearLastCreated ? null : (lastCreatedId ?? this.lastCreatedId),
    );
  }

  @override
  List<Object?> get props => [
        status,
        trips,
        filter,
        errorMessage,
        isMutating,
        lastCreatedId,
      ];
}

// ────────────────────────────────────────────────────────────
// Cubit
// ────────────────────────────────────────────────────────────

class ScheduledTripsCubit extends Cubit<ScheduledTripsState> {
  ScheduledTripsCubit() : super(const ScheduledTripsState());

  final _dio = ApiClient.instance.dio;

  // ── List ─────────────────────────────────────────────────

  /// Load scheduled trips for the current filter tab.
  Future<void> loadTrips({ScheduledTripFilter? filter}) async {
    final activeFilter = filter ?? state.filter;

    emit(state.copyWith(
      status: ScheduledTripsStatus.loading,
      filter: activeFilter,
      clearError: true,
    ));

    try {
      final response = await _dio.get(
        '/v1/trips/scheduled',
        queryParameters: {'status': activeFilter.queryParam},
      );

      final list = (response.data as List<dynamic>)
          .map((e) => ScheduledTrip.fromJson(e as Map<String, dynamic>))
          .toList();

      emit(state.copyWith(
        status: ScheduledTripsStatus.loaded,
        trips: list,
      ));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: ScheduledTripsStatus.error,
        errorMessage: e.response?.data?['error']?['message'] ??
            'Failed to load scheduled trips',
      ));
    }
  }

  /// Switch filter tab and reload.
  Future<void> setFilter(ScheduledTripFilter filter) => loadTrips(filter: filter);

  // ── Create ───────────────────────────────────────────────

  /// Create a new scheduled trip.
  ///
  /// [destination] is a [PlaceLocation] from the trip registration form.
  /// [scheduledAt] must be in the future.
  Future<void> createScheduledTrip({
    required PlaceLocation destination,
    required DateTime scheduledAt,
    String? label,
    String? transportCompany,
    String? vehicleType,
    String? vehiclePlateNumber,
  }) async {
    emit(state.copyWith(isMutating: true, clearError: true));

    try {
      final body = <String, dynamic>{
        'destination': {
          'name': destination.name ?? '',
          'lat': destination.latitude,
          'lng': destination.longitude,
        },
        'scheduled_at': scheduledAt.toUtc().toIso8601String(),
        if (label != null && label.isNotEmpty) 'label': label,
        if (transportCompany != null && transportCompany.isNotEmpty)
          'transport_company': transportCompany,
        if (vehicleType != null && vehicleType.isNotEmpty)
          'vehicle_type': vehicleType,
        if (vehiclePlateNumber != null && vehiclePlateNumber.isNotEmpty)
          'vehicle_plate_number': vehiclePlateNumber,
      };

      final response = await _dio.post('/v1/trips/scheduled', data: body);
      final created = ScheduledTrip.fromJson(
          response.data as Map<String, dynamic>);

      // Prepend to list if we're viewing the upcoming filter.
      final updatedList = state.filter == ScheduledTripFilter.upcoming
          ? [created, ...state.trips]
          : state.trips;

      emit(state.copyWith(
        isMutating: false,
        trips: updatedList,
        lastCreatedId: created.id,
      ));
    } on DioException catch (e) {
      emit(state.copyWith(
        isMutating: false,
        errorMessage: e.response?.data?['error']?['message'] ??
            'Failed to schedule trip',
      ));
    }
  }

  // ── Cancel ───────────────────────────────────────────────

  /// Cancel a scheduled trip (soft-delete — status → cancelled).
  Future<void> cancelScheduledTrip(String tripId) async {
    emit(state.copyWith(isMutating: true, clearError: true));

    try {
      await _dio.delete('/v1/trips/scheduled/$tripId');

      // Remove from current list (since cancelled trips don't appear in upcoming)
      final updatedList =
          state.trips.where((t) => t.id != tripId).toList();

      emit(state.copyWith(
        isMutating: false,
        trips: updatedList,
      ));
    } on DioException catch (e) {
      emit(state.copyWith(
        isMutating: false,
        errorMessage: e.response?.data?['error']?['message'] ??
            'Failed to cancel scheduled trip',
      ));
    }
  }
}
