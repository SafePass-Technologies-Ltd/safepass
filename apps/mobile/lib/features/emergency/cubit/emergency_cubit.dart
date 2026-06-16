import 'dart:async';
import 'dart:io';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';
import '../../../core/services/audio_recording_service.dart';

enum EmergencyStatus { initial, triggering, active, checkingIn, checkedIn, error }

class EmergencyState extends Equatable {
  final EmergencyStatus status;
  final String? tripId;
  final String? emergencyEventId;
  final String? errorMessage;

  const EmergencyState({
    this.status = EmergencyStatus.initial,
    this.tripId,
    this.emergencyEventId,
    this.errorMessage,
  });

  EmergencyState copyWith({
    EmergencyStatus? status,
    String? tripId,
    String? emergencyEventId,
    String? errorMessage,
  }) {
    return EmergencyState(
      status: status ?? this.status,
      tripId: tripId ?? this.tripId,
      emergencyEventId: emergencyEventId ?? this.emergencyEventId,
      errorMessage: errorMessage,
    );
  }

  @override
  List<Object?> get props => [status, tripId, emergencyEventId, errorMessage];
}

class EmergencyCubit extends Cubit<EmergencyState> {
  EmergencyCubit({AudioRecordingService? audioRecordingService})
      : _audioRecordingService = audioRecordingService ?? AudioRecordingService(),
        super(const EmergencyState());

  final _dio = ApiClient.instance.dio;
  final AudioRecordingService _audioRecordingService;

  Future<void> triggerPanic(String tripId) async {
    emit(state.copyWith(status: EmergencyStatus.triggering, tripId: tripId));

    try {
      final response = await _dio.post('/v1/emergency/trigger', data: {
        'tripId': tripId,
        'latitude': 0.0,
        'longitude': 0.0,
      });

      final emergencyEventId = response.data['id'] as String?;

      // Start silent audio recording in the background. This must never
      // block or fail the emergency activation flow — a denied permission
      // or recorder error should not prevent the panic alert from going out.
      unawaited(_audioRecordingService.start());

      emit(state.copyWith(
        status: EmergencyStatus.active,
        emergencyEventId: emergencyEventId,
      ));
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
      await _stopAndUploadRecording();
      emit(state.copyWith(status: EmergencyStatus.checkedIn));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: EmergencyStatus.error,
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Check-in failed',
      ));
    }
  }

  /// Stops the active recording and uploads it to the emergency event.
  /// Upload failures are swallowed — losing the audio file must never
  /// block the user from checking in safe.
  Future<void> _stopAndUploadRecording() async {
    final filePath = await _audioRecordingService.stop();
    final emergencyEventId = state.emergencyEventId;

    if (filePath == null || emergencyEventId == null) return;

    try {
      final file = File(filePath);
      if (!await file.exists()) return;

      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(filePath, filename: file.uri.pathSegments.last),
      });

      await _dio.post('/v1/emergency/$emergencyEventId/audio', data: formData);
    } catch (_) {
      // Best-effort upload — do not surface this to the user mid-checkin.
    }
  }

  void cancel() {
    emit(const EmergencyState());
  }

  @override
  Future<void> close() {
    _audioRecordingService.dispose();
    return super.close();
  }
}
