import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';

class MapMarker extends Equatable {
  final String id;
  final String type;
  final String description;
  final double latitude;
  final double longitude;
  final String status;
  final int verifiedCount;
  final int disputeCount;

  const MapMarker({
    required this.id,
    required this.type,
    required this.description,
    required this.latitude,
    required this.longitude,
    required this.status,
    required this.verifiedCount,
    required this.disputeCount,
  });

  factory MapMarker.fromJson(Map<String, dynamic> json) => MapMarker(
        id: json['id'] as String,
        type: json['type'] as String? ?? '',
        description: json['description'] as String? ?? '',
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
        status: json['status'] as String? ?? 'active',
        verifiedCount: json['verifiedCount'] as int? ?? 0,
        disputeCount: json['disputeCount'] as int? ?? 0,
      );

  @override
  List<Object?> get props =>
      [id, type, description, latitude, longitude, status, verifiedCount, disputeCount];
}

enum MarkerActionStatus { initial, loading, submitting, success, error }

class MarkerState extends Equatable {
  final MarkerActionStatus status;
  final MapMarker? marker;
  final String? errorMessage;

  const MarkerState({
    this.status = MarkerActionStatus.initial,
    this.marker,
    this.errorMessage,
  });

  MarkerState copyWith({
    MarkerActionStatus? status,
    MapMarker? marker,
    String? errorMessage,
  }) {
    return MarkerState(
      status: status ?? this.status,
      marker: marker ?? this.marker,
      errorMessage: errorMessage,
    );
  }

  @override
  List<Object?> get props => [status, marker, errorMessage];
}

class MarkerCubit extends Cubit<MarkerState> {
  MarkerCubit() : super(const MarkerState());

  final _dio = ApiClient.instance.dio;

  Future<void> loadMarker(String markerId) async {
    emit(state.copyWith(status: MarkerActionStatus.loading));

    try {
      final response = await _dio.get('/v1/map-markers/$markerId');
      final data = response.data as Map<String, dynamic>;
      final marker = MapMarker.fromJson(
        data['marker'] as Map<String, dynamic>? ?? data,
      );
      emit(state.copyWith(status: MarkerActionStatus.success, marker: marker));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: MarkerActionStatus.error,
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Failed to load marker',
      ));
    }
  }

  Future<void> confirmMarker(String markerId) async {
    await _performAction(markerId, {'action': 'confirm'});
  }

  Future<void> disputeMarker(String markerId) async {
    await _performAction(markerId, {'action': 'dispute'});
  }

  Future<void> reclassifyMarker(String markerId, String newType) async {
    await _performAction(markerId, {'action': 'reclassify', 'newType': newType});
  }

  Future<void> _performAction(String markerId, Map<String, dynamic> body) async {
    emit(state.copyWith(status: MarkerActionStatus.submitting));

    try {
      final response = await _dio.patch('/v1/map-markers/$markerId', data: body);
      final data = response.data as Map<String, dynamic>;
      final marker = MapMarker.fromJson(
        data['marker'] as Map<String, dynamic>? ?? data,
      );
      emit(state.copyWith(status: MarkerActionStatus.success, marker: marker));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: MarkerActionStatus.error,
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Action failed',
      ));
    }
  }
}
