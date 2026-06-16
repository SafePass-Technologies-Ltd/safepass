import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import '../../../app/theme.dart';
import '../cubit/incident_cubit.dart';

class IncidentReportScreen extends StatelessWidget {
  const IncidentReportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => IncidentCubit(),
      child: const _IncidentReportView(),
    );
  }
}

class _IncidentReportView extends StatefulWidget {
  const _IncidentReportView();

  @override
  State<_IncidentReportView> createState() => _IncidentReportViewState();
}

class _IncidentReportViewState extends State<_IncidentReportView> {
  final _descriptionController = TextEditingController();

  @override
  void dispose() {
    _descriptionController.dispose();
    super.dispose();
  }

  static const _typeIcons = <IncidentType, IconData>{
    IncidentType.robbery: Icons.security_outlined,
    IncidentType.accident: Icons.car_crash_outlined,
    IncidentType.harassment: Icons.person_off_outlined,
    IncidentType.road_block: Icons.block,
    IncidentType.flood: Icons.water_outlined,
    IncidentType.fire: Icons.local_fire_department_outlined,
    IncidentType.medical: Icons.medical_services_outlined,
    IncidentType.suspicious_activity: Icons.visibility_outlined,
    IncidentType.other: Icons.more_horiz,
  };

  static const _typeLabels = <IncidentType, String>{
    IncidentType.robbery: 'Robbery',
    IncidentType.accident: 'Accident',
    IncidentType.harassment: 'Harassment',
    IncidentType.road_block: 'Road Block',
    IncidentType.flood: 'Flood',
    IncidentType.fire: 'Fire',
    IncidentType.medical: 'Medical',
    IncidentType.suspicious_activity: 'Suspicious',
    IncidentType.other: 'Other',
  };

  Future<void> _useMyLocation(BuildContext context) async {
    final cubit = context.read<IncidentCubit>();
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) return;

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) return;
      }
      if (permission == LocationPermission.deniedForever) return;

      final position = await Geolocator.getCurrentPosition();
      cubit.setLocation(position.latitude, position.longitude);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not get location: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Report Incident')),
      body: BlocConsumer<IncidentCubit, IncidentState>(
        listener: (context, state) {
          if (state.status == IncidentStatus.submitted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Incident reported. Thank you.')),
            );
            Navigator.of(context).pop();
          }
        },
        builder: (context, state) {
          final cubit = context.read<IncidentCubit>();

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Select Incident Type',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 12),
                GridView.count(
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  children: IncidentType.values.map((type) {
                    final isSelected = state.selectedType == type;
                    return GestureDetector(
                      onTap: () => cubit.setType(type),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? AppColors.primary.withValues(alpha: 0.15)
                              : AppColors.white,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: isSelected
                                ? AppColors.primary
                                : const Color(0xFFE2E8F0),
                            width: isSelected ? 2 : 1,
                          ),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              _typeIcons[type]!,
                              color: isSelected
                                  ? AppColors.primary
                                  : AppColors.darkSlate,
                              size: 28,
                            ),
                            const SizedBox(height: 6),
                            Text(
                              _typeLabels[type]!,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: isSelected
                                    ? FontWeight.w600
                                    : FontWeight.normal,
                                color: isSelected
                                    ? AppColors.primary
                                    : AppColors.darkSlate,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _descriptionController,
                  maxLines: 4,
                  maxLength: 500,
                  decoration: const InputDecoration(
                    labelText: 'Description',
                    hintText: 'Describe what happened...',
                    alignLabelWithHint: true,
                    border: OutlineInputBorder(),
                  ),
                  onChanged: cubit.setDescription,
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () => _useMyLocation(context),
                  icon: const Icon(Icons.my_location),
                  label: Text(
                    state.latitude != null
                        ? 'Location set (${state.latitude!.toStringAsFixed(4)}, ${state.longitude!.toStringAsFixed(4)})'
                        : 'Use My Location',
                  ),
                ),
                const SizedBox(height: 24),
                if (state.status == IncidentStatus.error &&
                    state.errorMessage != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.emergencyRed.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: AppColors.emergencyRed.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Text(
                      state.errorMessage!,
                      style: const TextStyle(color: AppColors.emergencyRed),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                FilledButton(
                  onPressed: state.selectedType != null &&
                          state.status != IncidentStatus.submitting
                      ? cubit.submit
                      : null,
                  child: state.status == IncidentStatus.submitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.white,
                          ),
                        )
                      : const Text('Submit Report'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
