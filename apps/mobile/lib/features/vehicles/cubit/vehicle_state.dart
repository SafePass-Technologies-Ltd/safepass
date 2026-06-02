part of 'vehicle_cubit.dart';

/// Vehicle loading status.
enum VehicleStatus { initial, loading, loaded, saving, error }

/// A saved user vehicle as returned by the API.
class VehicleModel extends Equatable {
  final String id;
  final String plateNumber;
  final String vehicleType;
  final String? make;
  final String? model;
  final String? colour;
  final bool isDefault;

  const VehicleModel({
    required this.id,
    required this.plateNumber,
    required this.vehicleType,
    this.make,
    this.model,
    this.colour,
    this.isDefault = false,
  });

  factory VehicleModel.fromJson(Map<String, dynamic> json) {
    return VehicleModel(
      id: json['id'] as String? ?? '',
      plateNumber: json['plateNumber'] as String? ?? '',
      vehicleType: json['vehicleType'] as String? ?? 'car',
      make: json['make'] as String?,
      model: json['model'] as String?,
      colour: json['colour'] as String?,
      isDefault: json['isDefault'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toCreateJson() => {
        'plateNumber': plateNumber,
        'vehicleType': vehicleType,
        if (make != null) 'make': make,
        if (model != null) 'model': model,
        if (colour != null) 'colour': colour,
        'isDefault': isDefault,
      };

  @override
  List<Object?> get props =>
      [id, plateNumber, vehicleType, make, model, colour, isDefault];
}

/// State for the VehicleCubit.
class VehicleState extends Equatable {
  final VehicleStatus status;
  final String? errorMessage;
  final List<VehicleModel> vehicles;

  const VehicleState({
    required this.status,
    this.errorMessage,
    this.vehicles = const [],
  });

  const VehicleState.initial()
      : status = VehicleStatus.initial,
        errorMessage = null,
        vehicles = const [];

  VehicleState copyWith({
    VehicleStatus? status,
    String? errorMessage,
    List<VehicleModel>? vehicles,
  }) {
    return VehicleState(
      status: status ?? this.status,
      errorMessage: errorMessage,
      vehicles: vehicles ?? this.vehicles,
    );
  }

  @override
  List<Object?> get props => [status, errorMessage, vehicles];
}
