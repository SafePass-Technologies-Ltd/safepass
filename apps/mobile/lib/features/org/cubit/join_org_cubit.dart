/// JoinOrg Cubit — handles org invite token redemption.
library join_org_cubit;

import 'package:dio/dio.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/api/api_client.dart';

// ────────────────────────────────────────────────────────────
// State
// ────────────────────────────────────────────────────────────

enum JoinOrgStatus { initial, resolving, orgFound, joining, success, error }

class JoinOrgState extends Equatable {
  final JoinOrgStatus status;
  final String? orgName;
  final String? orgType;
  final String? errorMessage;
  final bool alreadyInOrg;

  const JoinOrgState({
    this.status = JoinOrgStatus.initial,
    this.orgName,
    this.orgType,
    this.errorMessage,
    this.alreadyInOrg = false,
  });

  JoinOrgState copyWith({
    JoinOrgStatus? status,
    String? orgName,
    String? orgType,
    String? errorMessage,
    bool? alreadyInOrg,
    bool clearError = false,
  }) {
    return JoinOrgState(
      status: status ?? this.status,
      orgName: orgName ?? this.orgName,
      orgType: orgType ?? this.orgType,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      alreadyInOrg: alreadyInOrg ?? this.alreadyInOrg,
    );
  }

  @override
  List<Object?> get props =>
      [status, orgName, orgType, errorMessage, alreadyInOrg];
}

// ────────────────────────────────────────────────────────────
// Cubit
// ────────────────────────────────────────────────────────────

class JoinOrgCubit extends Cubit<JoinOrgState> {
  JoinOrgCubit() : super(const JoinOrgState());

  final _dio = ApiClient.instance.dio;

  /// Resolve the token to get org details before confirming.
  ///
  /// Calls POST /v1/org/join/resolve — if that endpoint doesn't exist yet,
  /// falls back to GET /v1/org/invite/:token to preview org info.
  Future<void> resolveToken(String token) async {
    if (token.trim().isEmpty) return;

    emit(state.copyWith(status: JoinOrgStatus.resolving, clearError: true));

    try {
      final response = await _dio.post(
        '/v1/org/join/resolve',
        data: {'token': token.trim()},
      );

      final data = response.data as Map<String, dynamic>;
      emit(state.copyWith(
        status: JoinOrgStatus.orgFound,
        orgName: data['orgName'] as String? ?? data['name'] as String?,
        orgType: data['orgType'] as String? ?? data['type'] as String?,
      ));
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;
      final message =
          e.response?.data?['error']?['message'] as String? ??
          e.response?.data?['message'] as String?;

      if (statusCode == 404) {
        emit(state.copyWith(
          status: JoinOrgStatus.error,
          errorMessage:
              'Invalid token. Check the token and try again.',
        ));
      } else if (statusCode == 410) {
        emit(state.copyWith(
          status: JoinOrgStatus.error,
          errorMessage:
              'This invite token has expired. Ask your organisation admin to generate a new one.',
        ));
      } else if (statusCode == 409) {
        // Already in an org
        final existingOrg =
            e.response?.data?['orgName'] as String? ?? 'an organisation';
        emit(state.copyWith(
          status: JoinOrgStatus.error,
          errorMessage:
              'You are already a member of $existingOrg. Leave your current organisation before joining a new one.',
          alreadyInOrg: true,
        ));
      } else {
        emit(state.copyWith(
          status: JoinOrgStatus.error,
          errorMessage: message ?? 'Network error. Check your connection and try again.',
        ));
      }
    }
  }

  /// Confirm joining the organisation after the user accepts consent.
  Future<void> acceptAndJoin(String token) async {
    emit(state.copyWith(status: JoinOrgStatus.joining, clearError: true));

    try {
      await _dio.post('/v1/org/join', data: {'token': token.trim()});

      emit(state.copyWith(status: JoinOrgStatus.success));
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;
      final message =
          e.response?.data?['error']?['message'] as String? ??
          e.response?.data?['message'] as String?;

      if (statusCode == 404) {
        emit(state.copyWith(
          status: JoinOrgStatus.error,
          errorMessage: 'Invalid token. Check the token and try again.',
        ));
      } else if (statusCode == 410) {
        emit(state.copyWith(
          status: JoinOrgStatus.error,
          errorMessage:
              'This invite token has expired. Ask your organisation admin to generate a new one.',
        ));
      } else if (statusCode == 409) {
        final existingOrg =
            e.response?.data?['orgName'] as String? ?? 'an organisation';
        emit(state.copyWith(
          status: JoinOrgStatus.error,
          errorMessage:
              'You are already a member of $existingOrg. Leave your current organisation before joining a new one.',
          alreadyInOrg: true,
        ));
      } else {
        emit(state.copyWith(
          status: JoinOrgStatus.error,
          errorMessage: message ?? 'Network error. Check your connection and try again.',
        ));
      }
    }
  }

  /// Reset to initial state.
  void reset() {
    emit(const JoinOrgState());
  }
}
