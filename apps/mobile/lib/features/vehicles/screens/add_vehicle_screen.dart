/// Add/Edit Vehicle Screen — Form to save a personal vehicle.
library add_vehicle_screen;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../app/theme.dart';
import '../cubit/vehicle_cubit.dart';

class AddVehicleScreen extends StatefulWidget {
  const AddVehicleScreen({super.key});

  @override
  State<AddVehicleScreen> createState() => _AddVehicleScreenState();
}

class _AddVehicleScreenState extends State<AddVehicleScreen> {
  final _plateNumberController = TextEditingController();
  final _makeController = TextEditingController();
  final _modelController = TextEditingController();
  final _colourController = TextEditingController();
  String _vehicleType = 'car';
  bool _isDefault = false;
  bool _isSaving = false;

  static const _vehicleTypes = [
    'car',
    'bus',
    'suv',
    'truck',
    'motorcycle',
    'other',
  ];

  @override
  void dispose() {
    _plateNumberController.dispose();
    _makeController.dispose();
    _modelController.dispose();
    _colourController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_plateNumberController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Plate number is required'),
          backgroundColor: AppColors.emergencyRed,
        ),
      );
      return;
    }

    setState(() => _isSaving = true);

    final success = await context.read<VehicleCubit>().createVehicle({
      'plateNumber': _plateNumberController.text.trim(),
      'vehicleType': _vehicleType,
      'make': _makeController.text.trim().isEmpty
          ? null
          : _makeController.text.trim(),
      'model': _modelController.text.trim().isEmpty
          ? null
          : _modelController.text.trim(),
      'colour': _colourController.text.trim().isEmpty
          ? null
          : _colourController.text.trim(),
      'isDefault': _isDefault,
    });

    if (mounted) {
      if (success) {
        Navigator.of(context).pop();
      } else {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Add Vehicle')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _plateNumberController,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(
                labelText: 'Plate Number *',
                hintText: 'ABC-123-XY',
                prefixIcon: Icon(Icons.confirmation_number_outlined),
              ),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _vehicleType,
              decoration: const InputDecoration(
                labelText: 'Vehicle Type *',
                prefixIcon: Icon(Icons.directions_car_outlined),
              ),
              items: _vehicleTypes.map((type) {
                return DropdownMenuItem(
                  value: type,
                  child: Text(_formatVehicleType(type)),
                );
              }).toList(),
              onChanged: (value) {
                if (value != null) setState(() => _vehicleType = value);
              },
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _makeController,
              decoration: const InputDecoration(
                labelText: 'Make (Optional)',
                hintText: 'e.g., Toyota',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _modelController,
              decoration: const InputDecoration(
                labelText: 'Model (Optional)',
                hintText: 'e.g., Camry',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _colourController,
              decoration: const InputDecoration(
                labelText: 'Colour (Optional)',
                hintText: 'e.g., White',
                prefixIcon: Icon(Icons.colorize_outlined),
              ),
            ),
            const SizedBox(height: 24),
            Card(
              child: SwitchListTile(
                title: const Text('Set as default vehicle'),
                subtitle: const Text(
                    'This vehicle will be pre-selected on trip registration'),
                value: _isDefault,
                onChanged: (value) => setState(() => _isDefault = value),
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _isSaving ? null : _save,
              child: _isSaving
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Save Vehicle'),
            ),
          ],
        ),
      ),
    );
  }

  String _formatVehicleType(String type) {
    return switch (type) {
      'car' => 'Car',
      'bus' => 'Bus',
      'suv' => 'SUV',
      'truck' => 'Truck',
      'motorcycle' => 'Motorcycle',
      'other' => 'Other',
      _ => type,
    };
  }
}
