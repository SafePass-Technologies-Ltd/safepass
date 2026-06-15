import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';

enum IncidentStatus { initial, submitting, submitted, error }

enum IncidentType {
  robbery,
  accident,
  harassment,
  road_block,
  flood,
  fire,
  medical,
  suspicious_activity,
  other,
}

class IncidentState extends Equatable {
  final IncidentStatus status;
  final IncidentType? selectedType;
  final String description;
  final double? latitude;
  final double? longitude;
  final String? errorMessage;

  const IncidentState({
    this.status = IncidentStatus.initial,
    this.selectedType,
    this.description = '',
    this.latitude,
    this.longitude,
    this.errorMessage,
  });

  IncidentState copyWith({
    IncidentStatus? status,
    IncidentType? selectedType,
    String? description,
    double? latitude,
    double? longitude,
    String? errorMessage,
    bool clearSelectedType = false,
  }) {
    return IncidentState(
      status: status ?? this.status,
      selectedType: clearSelectedType ? null : (selectedType ?? this.selectedType),
      description: description ?? this.description,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      errorMessage: errorMessage,
    );
  }

  @override
  List<Object?> get props =>
      [status, selectedType, description, latitude, longitude, errorMessage];
}

class IncidentCubit extends Cubit<IncidentState> {
  IncidentCubit() : super(const IncidentState());

  final _dio = ApiClient.instance.dio;

  void setType(IncidentType type) {
    emit(state.copyWith(selectedType: type));
  }

  void setDescription(String description) {
    emit(state.copyWith(description: description));
  }

  void setLocation(double lat, double lng) {
    emit(state.copyWith(latitude: lat, longitude: lng));
  }

  Future<void> submit() async {
    if (state.selectedType == null) return;

    emit(state.copyWith(status: IncidentStatus.submitting));

    try {
      await _dio.post('/v1/incidents', data: {
        'type': state.selectedType!.name,
        'description': state.description,
        'latitude': state.latitude,
        'longitude': state.longitude,
      });

      emit(state.copyWith(status: IncidentStatus.submitted));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: IncidentStatus.error,
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Failed to submit incident',
      ));
    }
  }
}
