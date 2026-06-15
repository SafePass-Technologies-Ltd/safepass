import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';

enum EmergencyStatus { initial, triggering, active, checkingIn, checkedIn, error }

class EmergencyState extends Equatable {
  final EmergencyStatus status;
  final String? tripId;
  final String? errorMessage;

  const EmergencyState({
    this.status = EmergencyStatus.initial,
    this.tripId,
    this.errorMessage,
  });

  EmergencyState copyWith({
    EmergencyStatus? status,
    String? tripId,
    String? errorMessage,
  }) {
    return EmergencyState(
      status: status ?? this.status,
      tripId: tripId ?? this.tripId,
      errorMessage: errorMessage,
    );
  }

  @override
  List<Object?> get props => [status, tripId, errorMessage];
}

class EmergencyCubit extends Cubit<EmergencyState> {
  EmergencyCubit() : super(const EmergencyState());

  final _dio = ApiClient.instance.dio;

  Future<void> triggerPanic(String tripId) async {
    emit(state.copyWith(status: EmergencyStatus.triggering, tripId: tripId));

    try {
      await _dio.post('/v1/emergency/panic', data: {
        'tripId': tripId,
        'latitude': 0.0,
        'longitude': 0.0,
      });

      emit(state.copyWith(status: EmergencyStatus.active));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: EmergencyStatus.error,
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Failed to trigger emergency',
      ));
    }
  }

  Future<void> checkIn() async {
    if (state.tripId == null) return;

    emit(state.copyWith(status: EmergencyStatus.checkingIn));

    try {
      await _dio.post('/v1/emergency/${state.tripId}/check-in');
      emit(state.copyWith(status: EmergencyStatus.checkedIn));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: EmergencyStatus.error,
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Check-in failed',
      ));
    }
  }

  void cancel() {
    emit(const EmergencyState());
  }
}
