/// Trip Monitoring Cubit — manages active trip state, GPS tracking,
/// background foreground service, and trip lifecycle during an active journey.
///
/// Handles:
///   - GPS position tracking via geolocator (foreground)
///   - Background GPS via flutter_foreground_task (survives app minimise/kill)
///   - Position upload to backend API
///   - Trip status transitions (complete, cancel)
///   - Trip details loading
///   - Auto-resume: re-attaches to an in-flight background service on app restart
library;

import 'dart:async';
import 'dart:io' show Platform;
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../core/api/api_client.dart';
import '../../../core/constants.dart';

// ────────────────────────────────────────────────────────────
// Models
// ────────────────────────────────────────────────────────────

class TripDetail extends Equatable {
  final String id;
  final String userId;
  final String status;
  final Map<String, dynamic> origin;
  final Map<String, dynamic> destination;
  final Map<String, dynamic>? currentLocation;
  final String? vehiclePlateNumber;
  final String? vehicleDescription;
  final String? transportCompany;
  final String? driverName;
  final String? driverPhone;
  final String? startedAt;
  final String createdAt;
  /// True when vehicle fields were copied from a trip tag invite initiator.
  final bool vehicleCopiedFromInitiator;
  /// Full name of the initiator whose vehicle info was copied, if applicable.
  final String? vehicleSourceInitiatorName;

  const TripDetail({
    required this.id,
    required this.userId,
    required this.status,
    required this.origin,
    required this.destination,
    this.currentLocation,
    this.vehiclePlateNumber,
    this.vehicleDescription,
    this.transportCompany,
    this.driverName,
    this.driverPhone,
    this.startedAt,
    required this.createdAt,
    this.vehicleCopiedFromInitiator = false,
    this.vehicleSourceInitiatorName,
  });

  factory TripDetail.fromJson(Map<String, dynamic> json) => TripDetail(
        id: json['id'] as String,
        userId: json['userId'] as String,
        status: json['status'] as String? ?? 'active',
        origin: json['origin'] as Map<String, dynamic>,
        destination: json['destination'] as Map<String, dynamic>,
        currentLocation: json['currentLocation'] as Map<String, dynamic>?,
        vehiclePlateNumber: json['vehiclePlateNumber'] as String?,
        vehicleDescription: json['vehicleDescription'] as String?,
        transportCompany: json['transportCompany'] as String?,
        driverName: json['driverName'] as String?,
        driverPhone: json['driverPhone'] as String?,
        startedAt: json['startedAt'] as String?,
        createdAt: json['createdAt'] as String? ?? '',
        vehicleCopiedFromInitiator:
            json['vehicleCopiedFromInitiator'] as bool? ?? false,
        vehicleSourceInitiatorName:
            json['vehicleSourceInitiatorName'] as String?,
      );

  /// Create a copy with an overridden [status].
  TripDetail withStatus(String newStatus) => TripDetail(
        id: id,
        userId: userId,
        status: newStatus,
        origin: origin,
        destination: destination,
        currentLocation: currentLocation,
        vehiclePlateNumber: vehiclePlateNumber,
        vehicleDescription: vehicleDescription,
        transportCompany: transportCompany,
        driverName: driverName,
        driverPhone: driverPhone,
        startedAt: startedAt,
        createdAt: createdAt,
        vehicleCopiedFromInitiator: vehicleCopiedFromInitiator,
        vehicleSourceInitiatorName: vehicleSourceInitiatorName,
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

/// A nearby safety hazard surfaced from `/v1/markers/nearby`, used to drive
/// route safety alerts (M-08) while a trip is active.
class RouteHazard extends Equatable {
  final String id;
  final String markerType;
  final String title;
  final String? description;
  final String severity;
  final String verificationStatus;
  final double latitude;
  final double longitude;
  final double distanceMeters;

  const RouteHazard({
    required this.id,
    required this.markerType,
    required this.title,
    this.description,
    required this.severity,
    required this.verificationStatus,
    required this.latitude,
    required this.longitude,
    required this.distanceMeters,
  });

  factory RouteHazard.fromJson(Map<String, dynamic> json, double distanceMeters) {
    return RouteHazard(
      id: json['id'] as String,
      markerType: json['markerType'] as String? ?? 'high_risk_zone',
      title: json['title'] as String? ?? 'Safety hazard',
      description: json['description'] as String?,
      severity: json['severity'] as String? ?? 'medium',
      verificationStatus: json['verificationStatus'] as String? ?? 'unverified',
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      distanceMeters: distanceMeters,
    );
  }

  @override
  List<Object?> get props => [id, distanceMeters];
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

/// Backend trip statuses that mean "still being monitored" -- matches the
/// same set the web dashboards treat as "currently monitored" (see e.g.
/// transport-dashboard's Trip Map MONITORED_STATUSES). Anything else
/// (completed, cancelled) is terminal: a persisted `active_trip_id` pointing
/// at one of these is stale and must not be resumed/redirected into on
/// app restart (see startMonitoring/resumeIfActiveTrip below).
const _ongoingTripStatuses = {'active', 'delayed', 'emergency', 'escalated'};

class TripMonitoringState extends Equatable {
  final TripMonitorStatus status;
  final TripDetail? trip;
  final GpsPosition? lastPosition;
  final String? errorMessage;
  final int gpsUpdateCount;

  /// The most recently detected hazard alert that hasn't been shown yet,
  /// or `null` if there is nothing new to surface. The screen listens for
  /// this and clears it after displaying the banner.
  final RouteHazard? newHazardAlert;

  /// Every verified/partially-confirmed marker within the last hazard
  /// check's query radius (see _checkRouteHazards) -- unlike
  /// [newHazardAlert] (a one-shot "just entered range" alert, cleared after
  /// the banner is shown), this is the full current set, redrawn on the map
  /// every poll cycle. Per features.md's M-07 (Safety Map View): "Map
  /// showing ... active incidents, checkpoints, hotspots along route.
  /// Colour-coded markers by verification level" -- the banner alone
  /// (M-08) doesn't satisfy that; the map needs the actual marker icons.
  final List<RouteHazard> nearbyMarkers;

  const TripMonitoringState({
    this.status = TripMonitorStatus.initial,
    this.trip,
    this.lastPosition,
    this.errorMessage,
    this.gpsUpdateCount = 0,
    this.newHazardAlert,
    this.nearbyMarkers = const [],
  });

  TripMonitoringState copyWith({
    TripMonitorStatus? status,
    TripDetail? trip,
    GpsPosition? lastPosition,
    String? errorMessage,
    int? gpsUpdateCount,
    RouteHazard? newHazardAlert,
    bool clearHazardAlert = false,
    List<RouteHazard>? nearbyMarkers,
  }) {
    return TripMonitoringState(
      status: status ?? this.status,
      trip: trip ?? this.trip,
      lastPosition: lastPosition ?? this.lastPosition,
      errorMessage: errorMessage,
      gpsUpdateCount: gpsUpdateCount ?? this.gpsUpdateCount,
      newHazardAlert: clearHazardAlert ? null : (newHazardAlert ?? this.newHazardAlert),
      nearbyMarkers: nearbyMarkers ?? this.nearbyMarkers,
    );
  }

  @override
  List<Object?> get props => [
        status,
        trip,
        lastPosition,
        errorMessage,
        gpsUpdateCount,
        newHazardAlert,
        nearbyMarkers,
      ];
}

// ────────────────────────────────────────────────────────────
// Cubit
// ────────────────────────────────────────────────────────────

class TripMonitoringCubit extends Cubit<TripMonitoringState> {
  TripMonitoringCubit() : super(const TripMonitoringState());

  final _dio = ApiClient.instance.dio;
  StreamSubscription<Position>? _positionSubscription;

  /// Hazard radius (M-08): markers within this distance of the user trigger
  /// an alert.
  static const double _hazardAlertRadiusMeters = 500;

  /// Minimum time between proximity checks, to avoid hammering the API on
  /// every GPS tick.
  static const Duration _hazardCheckInterval = Duration(seconds: 45);

  DateTime? _lastHazardCheckAt;
  final Set<String> _shownHazardIds = {};
  bool _hazardCheckInFlight = false;

  // ---------------------------------------------------------------------------
  // Public lifecycle methods
  // ---------------------------------------------------------------------------

  /// Load trip details, persist the trip ID for auto-resume, and start both
  /// foreground GPS tracking and the background foreground service.
  Future<void> startMonitoring(String tripId) async {
    emit(state.copyWith(status: TripMonitorStatus.loading));

    try {
      final response = await _dio.get('/v1/trips/$tripId');
      final trip = TripDetail.fromJson(response.data as Map<String, dynamic>);

      // The trip may already be completed/cancelled server-side (e.g. an
      // admin/dashboard action, or a stale persisted ID from a previous
      // session that was never cleared) -- never start tracking or mark the
      // cubit "active" for a trip that isn't actually ongoing anymore, or
      // the router's auto-resume redirect sends the user right back into a
      // finished trip.
      if (!_ongoingTripStatuses.contains(trip.status)) {
        await ApiClient.instance.clearActiveTripId();
        emit(state.copyWith(
          status: trip.status == 'cancelled'
              ? TripMonitorStatus.cancelled
              : TripMonitorStatus.completed,
          trip: trip,
        ));
        return;
      }

      // Persist trip ID only after a confirmed successful API response so a
      // transient network error never stores a stale trip ID.
      await ApiClient.instance.saveActiveTripId(tripId);

      emit(state.copyWith(
        status: TripMonitorStatus.active,
        trip: trip,
      ));

      // Start foreground GPS tracking for immediate map updates.
      _startGpsTracking(tripId);

      // Start the OS-level background service so GPS uploads survive the app
      // being minimised or killed by the OS.
      await _startBackgroundService(tripId);

      // Listen for position data forwarded from the background isolate.
      FlutterForegroundTask.addTaskDataCallback(_onBackgroundData);
    } on DioException catch (e) {
      emit(state.copyWith(
        status: TripMonitorStatus.error,
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Failed to load trip',
      ));
    }
  }

  /// Re-attach to an active trip after app restart without launching a new
  /// background service instance.
  ///
  /// Called once the user is confirmed authenticated. If a persisted trip ID
  /// exists and the background service is already running, only the data
  /// callback is registered (no duplicate service). If the service is not
  /// running, [startMonitoring] is called to fully resume.
  Future<void> resumeIfActiveTrip() async {
    final tripId = await ApiClient.instance.getActiveTripId();
    if (tripId == null) return;

    final isRunning = await FlutterForegroundTask.isRunningService;
    if (isRunning) {
      // Service already tracking in background — just re-fetch trip details
      // and register the data callback so the UI receives position updates.
      try {
        final response = await _dio.get('/v1/trips/$tripId');
        final trip = TripDetail.fromJson(response.data as Map<String, dynamic>);

        // Same staleness check as startMonitoring: the background service
        // being alive only means it hasn't been killed yet, not that the
        // trip is still ongoing server-side (e.g. completed/cancelled from
        // another device while this one was closed). Resuming into a
        // finished trip -- and leaving an orphaned service uploading GPS
        // for it -- was the actual bug being fixed here.
        if (!_ongoingTripStatuses.contains(trip.status)) {
          await ApiClient.instance.clearActiveTripId();
          await FlutterForegroundTask.stopService();
          emit(state.copyWith(
            status: trip.status == 'cancelled'
                ? TripMonitorStatus.cancelled
                : TripMonitorStatus.completed,
            trip: trip,
          ));
          return;
        }

        emit(state.copyWith(
          status: TripMonitorStatus.active,
          trip: trip,
        ));
        FlutterForegroundTask.addTaskDataCallback(_onBackgroundData);
      } on DioException {
        // If the trip is no longer fetchable (e.g. already completed server-side),
        // clear the stored ID so we don't retry on the next restart.
        await ApiClient.instance.clearActiveTripId();
      }
    } else {
      // Service was killed — restart full monitoring.
      await startMonitoring(tripId);
    }
  }

  /// Mark trip as completed (safe arrival confirmed).
  Future<void> completeTrip() async {
    emit(state.copyWith(status: TripMonitorStatus.completing));

    try {
      await _dio.post('/v1/trips/${state.trip!.id}/complete');
      await _stopTracking();
      await ApiClient.instance.clearActiveTripId();

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
      await ApiClient.instance.clearActiveTripId();

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

  /// Clear the pending hazard alert after the UI has displayed it.
  void dismissHazardAlert() {
    emit(state.copyWith(clearHazardAlert: true));
  }

  // ---------------------------------------------------------------------------
  // Background foreground service
  // ---------------------------------------------------------------------------

  /// Configure and start the OS background foreground service.
  ///
  /// Uses [flutter_foreground_task] to keep GPS uploads alive even when the
  /// app is backgrounded or killed. The background isolate runs
  /// [tripBackgroundServiceEntryPoint] which independently streams positions
  /// to the API.
  Future<void> _startBackgroundService(String tripId) async {
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'safepass_trip_tracking',
        channelName: 'SafePass Trip Tracking',
        channelDescription: 'Background GPS tracking during an active trip',
        onlyAlertOnce: true,
      ),
      iosNotificationOptions: const IOSNotificationOptions(
        showNotification: true,
        playSound: false,
      ),
      foregroundTaskOptions: ForegroundTaskOptions(
        // No repeat event needed — the TaskHandler drives its own GPS stream.
        eventAction: ForegroundTaskEventAction.nothing(),
        autoRunOnBoot: false,
        allowWakeLock: true,
      ),
    );

    await FlutterForegroundTask.startService(
      serviceId: 1001,
      notificationTitle: 'SafePass Trip Active',
      notificationText: 'Monitoring your trip...',
      callback: tripBackgroundServiceEntryPoint,
    );
  }

  /// Receive position data forwarded from the background isolate and update UI.
  void _onBackgroundData(Object data) {
    if (data is! Map) return;
    final map = Map<String, dynamic>.from(data);
    final lat = map['lat'] as double?;
    final lng = map['lng'] as double?;
    if (lat == null || lng == null) return;

    final gpsPos = GpsPosition(
      latitude: lat,
      longitude: lng,
      speed: map['speed'] as double?,
    );

    emit(state.copyWith(
      lastPosition: gpsPos,
      gpsUpdateCount: state.gpsUpdateCount + 1,
    ));
  }

  // ---------------------------------------------------------------------------
  // Foreground GPS tracking (while app is in foreground)
  // ---------------------------------------------------------------------------

  /// Start foreground GPS position tracking for real-time map updates.
  void _startGpsTracking(String tripId) {
    // Warn the user if location services get disabled mid-trip.
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

      // Route safety alerts (M-08) — throttled proximity check.
      _maybeCheckRouteHazards(position);
    });
  }

  /// Check for nearby verified hazards, throttled to [_hazardCheckInterval]
  /// to avoid spamming the API on every GPS update.
  void _maybeCheckRouteHazards(Position position) {
    final now = DateTime.now();
    if (_hazardCheckInFlight) return;
    if (_lastHazardCheckAt != null &&
        now.difference(_lastHazardCheckAt!) < _hazardCheckInterval) {
      return;
    }
    _lastHazardCheckAt = now;
    _hazardCheckInFlight = true;

    _checkRouteHazards(position).whenComplete(() {
      _hazardCheckInFlight = false;
    });
  }

  /// Query nearby markers, update the full visible set for the map (M-07),
  /// and emit an alert for the closest hazard the user hasn't already been
  /// shown this trip (M-08).
  Future<void> _checkRouteHazards(Position position) async {
    try {
      final response = await _dio.get('/v1/markers/nearby', queryParameters: {
        'latitude': position.latitude,
        'longitude': position.longitude,
        // Query a wider radius than the alert threshold so distance can be
        // computed precisely client-side; server uses a bounding box. Also
        // the radius the map's marker layer displays at, not just the
        // tighter 500m alert-interrupt threshold below.
        'radius': 5,
      });

      final markers = (response.data['markers'] as List<dynamic>?) ?? [];

      RouteHazard? closestNewHazard;
      final visibleMarkers = <RouteHazard>[];

      for (final raw in markers) {
        final json = raw as Map<String, dynamic>;

        // Only verified or partially-confirmed hazards are worth showing —
        // unverified reports are too noisy for both the alert banner and
        // the map layer.
        final verificationStatus = json['verificationStatus'] as String?;
        if (verificationStatus != 'verified' &&
            verificationStatus != 'partially_confirmed') {
          continue;
        }

        final lat = (json['latitude'] as num).toDouble();
        final lng = (json['longitude'] as num).toDouble();
        final distance = Geolocator.distanceBetween(
          position.latitude,
          position.longitude,
          lat,
          lng,
        );

        final hazard = RouteHazard.fromJson(json, distance);
        visibleMarkers.add(hazard);

        // Alert-banner path (M-08) — separate, tighter radius + "already
        // shown this trip" de-dupe on top of the map layer above.
        if (_shownHazardIds.contains(hazard.id)) continue;
        if (distance > _hazardAlertRadiusMeters) continue;
        if (closestNewHazard == null || distance < closestNewHazard.distanceMeters) {
          closestNewHazard = hazard;
        }
      }

      if (closestNewHazard != null) {
        _shownHazardIds.add(closestNewHazard.id);
        emit(state.copyWith(newHazardAlert: closestNewHazard, nearbyMarkers: visibleMarkers));
      } else {
        emit(state.copyWith(nearbyMarkers: visibleMarkers));
      }
    } on DioException {
      // Hazard checks are best-effort — failures should not interrupt the
      // trip or surface an error to the user.
    }
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

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /// Stop foreground GPS stream, background service, and remove data callbacks.
  Future<void> _stopTracking() async {
    await _positionSubscription?.cancel();
    _positionSubscription = null;
    FlutterForegroundTask.removeTaskDataCallback(_onBackgroundData);
    await FlutterForegroundTask.stopService();
  }

  @override
  Future<void> close() {
    _stopTracking();
    return super.close();
  }
}

// ────────────────────────────────────────────────────────────
// Background isolate entry point
// ────────────────────────────────────────────────────────────

/// Entry point for the flutter_foreground_task background isolate.
///
/// The `@pragma('vm:entry-point')` annotation prevents the Dart tree-shaker
/// from removing this function in release builds.
@pragma('vm:entry-point')
void tripBackgroundServiceEntryPoint() {
  FlutterForegroundTask.setTaskHandler(_TripBackgroundTaskHandler());
}

/// Background task handler — streams GPS positions to the SafePass API
/// from the background isolate while the app is minimised or killed.
class _TripBackgroundTaskHandler extends TaskHandler {
  StreamSubscription<Position>? _positionSub;
  String? _tripId;

  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    // Read the persisted trip ID from secure storage.
    // FlutterSecureStorage works in background isolates on both platforms.
    const storage = FlutterSecureStorage();
    _tripId = await storage.read(key: 'active_trip_id');
    if (_tripId == null) {
      // No active trip — nothing to track.
      await FlutterForegroundTask.stopService();
      return;
    }

    // Determine platform-appropriate location settings.
    final locationSettings = _buildLocationSettings();

    _positionSub = Geolocator.getPositionStream(
      locationSettings: locationSettings,
    ).listen((position) {
      // Forward position to the main isolate for UI map updates.
      FlutterForegroundTask.sendDataToMain({
        'lat': position.latitude,
        'lng': position.longitude,
        'speed': position.speed,
      });

      // Upload to backend from the background isolate.
      _uploadPosition(_tripId!, position);
    });
  }

  /// Build platform-specific location settings.
  ///
  /// On iOS, [AppleSettings] disables automatic pause and sets the activity
  /// type to automotive navigation so Core Location maintains accuracy during
  /// long road trips.
  ///
  /// On Android, standard [LocationSettings] is used — the foreground service
  /// itself keeps the process alive and the location stream active.
  LocationSettings _buildLocationSettings() {
    if (Platform.isIOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
        pauseLocationUpdatesAutomatically: false,
        activityType: ActivityType.automotiveNavigation,
        allowBackgroundLocationUpdates: true,
        showBackgroundLocationIndicator: true,
      );
    }
    return const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10,
    );
  }

  /// Upload a single GPS position to the SafePass API.
  ///
  /// Creates a one-off Dio instance here because the singleton [ApiClient]
  /// lives in the main isolate and is not accessible from the background.
  Future<void> _uploadPosition(String tripId, Position position) async {
    try {
      const storage = FlutterSecureStorage();
      final token = await storage.read(key: 'access_token');
      if (token == null) return;

      // Lightweight Dio instance — no interceptors needed in the background.
      final dio = Dio(BaseOptions(
        baseUrl: kApiBaseUrl,
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
      ));

      await dio.post('/v1/trips/$tripId/gps', data: {
        'latitude': position.latitude,
        'longitude': position.longitude,
        'speed': position.speed,
        'heading': position.heading,
        'accuracy': position.accuracy,
      });
    } catch (_) {
      // Background upload failures are silent — the service continues tracking.
    }
  }

  @override
  void onRepeatEvent(DateTime timestamp) {
    // Not used — position stream drives all updates.
  }

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {
    await _positionSub?.cancel();
    _positionSub = null;
  }
}
