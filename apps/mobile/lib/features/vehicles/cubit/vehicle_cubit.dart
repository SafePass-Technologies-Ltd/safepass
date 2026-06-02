/// Vehicle Cubit — manages user's saved personal vehicles.
///
/// Loads the vehicle list from the API and supports create, update, and delete
/// operations with optimistic local updates.
library vehicle_cubit;

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/api/api_client.dart';

part 'vehicle_state.dart';

class VehicleCubit extends Cubit<VehicleState> {
  VehicleCubit() : super(const VehicleState.initial());

  /// Load all saved vehicles from GET /v1/users/me/vehicles.
  Future<void> loadVehicles() async {
    emit(state.copyWith(status: VehicleStatus.loading));

    try {
      final response =
          await ApiClient.instance.dio.get('/v1/users/me/vehicles');
      final list = (response.data['vehicles'] as List<dynamic>)
          .map((v) => VehicleModel.fromJson(v as Map<String, dynamic>))
          .toList();

      emit(state.copyWith(status: VehicleStatus.loaded, vehicles: list));
    } on Exception {
      emit(
        state.copyWith(
          status: VehicleStatus.error,
          errorMessage: 'Failed to load vehicles',
        ),
      );
    }
  }

  /// Create a new vehicle via POST /v1/users/me/vehicles.
  Future<bool> createVehicle(Map<String, dynamic> data) async {
    emit(state.copyWith(status: VehicleStatus.saving));

    try {
      await ApiClient.instance.dio.post('/v1/users/me/vehicles', data: data);
      // Reload to get server state (including the new ID)
      await loadVehicles();
      return true;
    } on Exception {
      emit(
        state.copyWith(
          status: VehicleStatus.error,
          errorMessage: 'Failed to save vehicle',
        ),
      );
      return false;
    }
  }

  /// Delete a vehicle via DELETE /v1/users/me/vehicles/:id.
  Future<bool> deleteVehicle(String vehicleId) async {
    emit(state.copyWith(status: VehicleStatus.saving));

    try {
      await ApiClient.instance.dio
          .delete('/v1/users/me/vehicles/$vehicleId');
      // Optimistic: remove from local list immediately
      emit(
        state.copyWith(
          status: VehicleStatus.loaded,
          vehicles:
              state.vehicles.where((v) => v.id != vehicleId).toList(),
        ),
      );
      return true;
    } on Exception {
      emit(
        state.copyWith(
          status: VehicleStatus.error,
          errorMessage: 'Failed to delete vehicle',
        ),
      );
      return false;
    }
  }
}
