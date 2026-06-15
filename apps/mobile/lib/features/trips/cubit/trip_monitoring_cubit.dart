/// Trip Monitoring Cubit — manages active trip state, GPS tracking,
/// WebSocket connection, and trip lifecycle during an active journey.
///
/// Handles:
///   - GPS position tracking via geolocator (foreground)
///   - Position upload to backend API
///   - Trip status transitions (complete, cancel)
///   - Trip details loading
library;

import 'dart:async';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import 'package:geolocator/geolocator.dart';
import '../../../core/api/api_client.dart';

// ────────────────────────────────────────────────────────────
// Models
// ────────────────────────────────────────────────────────────

class TripDetail extends Equatable {
  final String id;
  final String userId;
  final String tripMode;
  final String status;
  final Map<String, dynamic> origin;
  final Map<String, dynamic> destination;
  final Map<String, dynamic>? currentLocation;
  final String? vehiclePlateNumber;
  final String? transportCompany;
  final String? driverName;
  final String? driverPhone;
  final int? passengerCount;
  final String? startedAt;
  final String createdAt;

  const TripDetail({
    required this.id,
    required this.userId,
    required this.tripMode,
    required this.status,
    required this.origin,
    required this.destination,
    this.currentLocation,
    this.vehiclePlateNumber,
    this.transportCompany,
    this.driverName,
    this.driverPhone,
    this.passengerCount,
    this.startedAt,
    required this.createdAt,
  });

  factory TripDetail.fromJson(Map<String, dynamic> json) => TripDetail(
        id: json['id'] as String,
        userId: json['userId'] as String,
        tripMode: json['tripMode'] as String? ?? 'passenger',
        status: json['status'] as String? ?? 'active',
        origin: json['origin'] as Map<String, dynamic>,
        destination: json['destination'] as Map<String, dynamic>,
        currentLocation: json['currentLocation'] as Map<String, dynamic>?,
        vehiclePlateNumber: json['vehiclePlateNumber'] as String?,
        transportCompany: json['transportCompany'] as String?,
        driverName: json['driverName'] as String?,
        driverPhone: json['driverPhone'] as String?,
        passengerCount: json['passengerCount'] as int?,
        startedAt: json['startedAt'] as String?,
        createdAt: json['createdAt'] as String? ?? '',
      );

  /// Create a copy with an overridden [status].
  TripDetail withStatus(String newStatus) => TripDetail(
        id: id,
        userId: userId,
        tripMode: tripMode,
        status: newStatus,
        origin: origin,
        destination: destination,
        currentLocation: currentLocation,
        vehiclePlateNumber: vehiclePlateNumber,
        transportCompany: transportCompany,
        driverName: driverName,
        driverPhone: driverPhone,
        passengerCount: passengerCount,
        startedAt: startedAt,
        createdAt: createdAt,
      );

  @override
  List<Object?> get props => [id, status, origin, destination, currentLocation];
}

class GpsPosition extends Equatable {
  final double latitude;
  final double longitude;
  final double? speed;
  final double? heading;
  final double? accuracy;

  const GpsPosition({
    required this.latitude,
    required this.longitude,
    this.speed,
    this.heading,
    this.accuracy,
  });

  @override
  List<Object?> get props => [latitude, longitude, speed, heading];
}

// ────────────────────────────────────────────────────────────
// State
// ────────────────────────────────────────────────────────────

enum TripMonitorStatus {
  initial,
  loading,
  active,
  gpsUpdating,
  completing,
  cancelling,
  completed,
  cancelled,
  error,
}

class TripMonitoringState extends Equatable {
  final TripMonitorStatus status;
  final TripDetail? trip;
  final GpsPosition? lastPosition;
  final String? errorMessage;
  final int gpsUpdateCount;

  const TripMonitoringState({
    this.status = TripMonitorStatus.initial,
    this.trip,
    this.lastPosition,
    this.errorMessage,
    this.gpsUpdateCount = 0,
  });

  TripMonitoringState copyWith({
    TripMonitorStatus? status,
    TripDetail? trip,
    GpsPosition? lastPosition,
    String? errorMessage,
    int? gpsUpdateCount,
  }) {
    return TripMonitoringState(
      status: status ?? this.status,
      trip: trip ?? this.trip,
      lastPosition: lastPosition ?? this.lastPosition,
      errorMessage: errorMessage,
      gpsUpdateCount: gpsUpdateCount ?? this.gpsUpdateCount,
    );
  }

  @override
  List<Object?> get props => [
        status,
        trip,
        lastPosition,
        errorMessage,
        gpsUpdateCount,
      ];
}

// ────────────────────────────────────────────────────────────
// Cubit
// ────────────────────────────────────────────────────────────

class TripMonitoringCubit extends Cubit<TripMonitoringState> {
  TripMonitoringCubit() : super(const TripMonitoringState());

  final _dio = ApiClient.instance.dio;
  StreamSubscription<Position>? _positionSubscription;

  /// Load trip details and start GPS tracking.
  Future<void> startMonitoring(String tripId) async {
    emit(state.copyWith(status: TripMonitorStatus.loading));

    try {
      final response = await _dio.get('/v1/trips/$tripId');
      final trip = TripDetail.fromJson(response.data as Map<String, dynamic>);

      emit(state.copyWith(
        status: TripMonitorStatus.active,
        trip: trip,
      ));

      // Start GPS tracking.
      _startGpsTracking(tripId);
    } on DioException catch (e) {
      emit(state.copyWith(
        status: TripMonitorStatus.error,
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Failed to load trip',
      ));
    }
  }

  /// Start foreground GPS position tracking.
  void _startGpsTracking(String tripId) {
    // Check location permission and service.
    Geolocator.getServiceStatusStream().listen((status) {
      if (status == ServiceStatus.disabled) {
        emit(state.copyWith(
          errorMessage: 'Location services are disabled. Please enable GPS.',
        ));
      }
    });

    const locationSettings = LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10, // metres — only notify on significant movement
      timeLimit: null,
    );

    _positionSubscription =
        Geolocator.getPositionStream(locationSettings: locationSettings)
            .listen((position) {
      final gpsPos = GpsPosition(
        latitude: position.latitude,
        longitude: position.longitude,
        speed: position.speed,
        heading: position.heading,
        accuracy: position.accuracy,
      );

      // Emit local position update immediately for smooth map rendering.
      emit(state.copyWith(
        lastPosition: gpsPos,
        gpsUpdateCount: state.gpsUpdateCount + 1,
      ));

      // Upload position to backend (fire-and-forget).
      _uploadGpsPosition(tripId, position);
    });
  }

  /// Upload GPS position to the backend API.
  Future<void> _uploadGpsPosition(String tripId, Position position) async {
    try {
      await _dio.post('/v1/trips/$tripId/gps', data: {
        'latitude': position.latitude,
        'longitude': position.longitude,
        'speed': position.speed,
        'heading': position.heading,
        'accuracy': position.accuracy,
      });
    } on DioException {
      // GPS upload failures are non-critical — the user's screen
      // still shows their position. We silently retry on next update.
    }
  }

  /// Mark trip as completed (safe arrival confirmed).
  Future<void> completeTrip() async {
    emit(state.copyWith(status: TripMonitorStatus.completing));

    try {
      await _dio.post('/v1/trips/${state.trip!.id}/complete');
      await _stopTracking();

      emit(state.copyWith(
        status: TripMonitorStatus.completed,
        trip: state.trip?.withStatus('completed'),
      ));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: TripMonitorStatus.error,
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Failed to complete trip',
      ));
    }
  }

  /// Cancel the trip.
  Future<void> cancelTrip() async {
    emit(state.copyWith(status: TripMonitorStatus.cancelling));

    try {
      await _dio.post('/v1/trips/${state.trip!.id}/cancel');
      await _stopTracking();

      emit(state.copyWith(status: TripMonitorStatus.cancelled));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: TripMonitorStatus.error,
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Failed to cancel trip',
      ));
    }
  }

  /// Trigger an emergency (panic button).
  ///
  /// Sends the current GPS position to the backend emergency endpoint,
  /// which flags the trip as EMERGENCY and alerts monitoring officers.
  Future<void> triggerEmergency() async {
    final trip = state.trip;
    final position = state.lastPosition;

    if (trip == null || position == null) {
      emit(state.copyWith(
        errorMessage: 'Cannot trigger emergency — no active trip or GPS signal',
      ));
      return;
    }

    try {
      await _dio.post('/v1/emergency/trigger', data: {
        'tripId': trip.id,
        'latitude': position.latitude,
        'longitude': position.longitude,
        'speed': position.speed,
      });

      // Update local trip status to emergency immediately.
      emit(state.copyWith(
        trip: trip.withStatus('emergency'),
      ));
    } on DioException catch (e) {
      emit(state.copyWith(
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Failed to trigger emergency',
      ));
    }
  }

  /// Stop GPS tracking and clean up.
  Future<void> _stopTracking() async {
    await _positionSubscription?.cancel();
    _positionSubscription = null;
  }

  @override
  Future<void> close() {
    _stopTracking();
    return super.close();
  }
}
