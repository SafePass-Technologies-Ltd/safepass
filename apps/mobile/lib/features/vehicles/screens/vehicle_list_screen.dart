/// Vehicle List Screen — Manage saved personal vehicles.
library vehicle_list_screen;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme.dart';
import '../../../app/router.dart';
import '../cubit/vehicle_cubit.dart';

class VehicleListScreen extends StatefulWidget {
  const VehicleListScreen({super.key});

  @override
  State<VehicleListScreen> createState() => _VehicleListScreenState();
}

class _VehicleListScreenState extends State<VehicleListScreen> {
  @override
  void initState() {
    super.initState();
    context.read<VehicleCubit>().loadVehicles();
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<VehicleCubit, VehicleState>(
      listener: (context, state) {
        if (state.status == VehicleStatus.error) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(state.errorMessage ?? 'An error occurred'),
              backgroundColor: AppColors.emergencyRed,
            ),
          );
        }
      },
      builder: (context, state) {
        final isLoading = state.status == VehicleStatus.loading;

        return Scaffold(
          appBar: AppBar(
            title: const Text('My Vehicles'),
            actions: [
              IconButton(
                onPressed: () => context.push(AppRoutes.addVehicle),
                icon: const Icon(Icons.add),
                tooltip: 'Add Vehicle',
              ),
            ],
          ),
          body: isLoading
              ? const Center(child: CircularProgressIndicator())
              : state.vehicles.isEmpty
                  ? _buildEmptyState(context)
                  : _buildVehicleList(context, state.vehicles),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () => context.push(AppRoutes.addVehicle),
            icon: const Icon(Icons.add),
            label: const Text('Add Vehicle'),
            backgroundColor: AppColors.primary,
            foregroundColor: AppColors.white,
          ),
        );
      },
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.directions_car_outlined,
              size: 80,
              color: AppColors.darkSlate.withValues(alpha: 0.3),
            ),
            const SizedBox(height: 16),
            Text(
              'No saved vehicles yet',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: AppColors.darkSlate.withValues(alpha: 0.5),
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              'Add your vehicle to skip filling details\non every trip in driver mode.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.darkSlate.withValues(alpha: 0.4),
                  ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVehicleList(
      BuildContext context, List<VehicleModel> vehicles) {
    return RefreshIndicator(
      onRefresh: () => context.read<VehicleCubit>().loadVehicles(),
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: vehicles.length,
        itemBuilder: (context, index) {
          final vehicle = vehicles[index];
          return _VehicleCard(
            vehicle: vehicle,
            onTap: () {},
            onDelete: () {
              _confirmDelete(context, vehicle);
            },
          );
        },
      ),
    );
  }

  Future<void> _confirmDelete(
      BuildContext context, VehicleModel vehicle) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Vehicle'),
        content: Text('Remove ${vehicle.plateNumber} from your saved vehicles?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(
              foregroundColor: AppColors.emergencyRed,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      context.read<VehicleCubit>().deleteVehicle(vehicle.id);
    }
  }
}

/// Card widget for a single saved vehicle.
class _VehicleCard extends StatelessWidget {
  final VehicleModel vehicle;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const _VehicleCard({
    required this.vehicle,
    required this.onTap,
    required this.onDelete,
  });

  IconData _vehicleIcon() {
    switch (vehicle.vehicleType.toLowerCase()) {
      case 'bus':
        return Icons.directions_bus;
      case 'truck':
        return Icons.local_shipping;
      case 'motorcycle':
        return Icons.two_wheeler;
      default:
        return Icons.directions_car;
    }
  }

  String _buildSubtitle() {
    final parts = <String>[vehicle.vehicleType.toUpperCase()];
    if (vehicle.make != null && vehicle.model != null) {
      parts.add('${vehicle.make} ${vehicle.model}');
    } else if (vehicle.make != null) {
      parts.add(vehicle.make!);
    }
    if (vehicle.colour != null) {
      parts.add(vehicle.colour!);
    }
    return parts.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        contentPadding: const EdgeInsets.all(16),
        leading: Stack(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                _vehicleIcon(),
                color: AppColors.primary,
              ),
            ),
            if (vehicle.isDefault)
              const Positioned(
                right: 0,
                top: 0,
                child: Icon(
                  Icons.star,
                  size: 16,
                  color: AppColors.alertAmber,
                ),
              ),
          ],
        ),
        title: Text(
          vehicle.plateNumber,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          _buildSubtitle(),
          style: Theme.of(context).textTheme.bodySmall,
        ),
        trailing: IconButton(
          onPressed: onDelete,
          icon: const Icon(Icons.delete_outline, size: 20),
        ),
        onTap: onTap,
      ),
    );
  }
}
