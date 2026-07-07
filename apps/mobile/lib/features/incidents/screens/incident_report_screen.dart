import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import '../../../app/theme.dart';
import '../cubit/incident_cubit.dart';

/// Arguments passed via [GoRouter] `extra` when navigating to this screen
/// from the active trip screen. Both fields are optional — if omitted the
/// screen falls back to fetching the current GPS position via Geolocator.
class IncidentReportArgs {
  /// GPS latitude pre-filled from the active trip's last known position.
  final double? latitude;

  /// GPS longitude pre-filled from the active trip's last known position.
  final double? longitude;

  /// Trip ID to link this report to the in-progress trip on the backend.
  final String? tripId;

  const IncidentReportArgs({this.latitude, this.longitude, this.tripId});
}

class IncidentReportScreen extends StatelessWidget {
  /// Optional pre-fill data — latitude/longitude avoid a redundant Geolocator
  /// call and tripId associates the report with the current trip.
  final IncidentReportArgs? args;

  const IncidentReportScreen({super.key, this.args});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => IncidentCubit(
        initialLatitude: args?.latitude,
        initialLongitude: args?.longitude,
        tripId: args?.tripId,
      ),
      child: _IncidentReportView(prefilled: args?.latitude != null),
    );
  }
}

class _IncidentReportView extends StatefulWidget {
  /// When true, the cubit was already seeded with GPS coordinates from the
  /// active trip and no Geolocator fetch is needed.
  final bool prefilled;

  const _IncidentReportView({this.prefilled = false});

  @override
  State<_IncidentReportView> createState() => _IncidentReportViewState();
}

class _IncidentReportViewState extends State<_IncidentReportView> {
  final _descriptionController = TextEditingController();

  @override
  void initState() {
    super.initState();
    // Skip the Geolocator round-trip if the caller already provided
    // coordinates (e.g. from the active trip screen's last known GPS fix).
    if (!widget.prefilled) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _fetchLocation());
    }
  }

  /// Requests the device's current GPS position and updates the cubit.
  /// Only called when no pre-filled coordinates were provided.
  Future<void> _fetchLocation() async {
    if (!mounted) return;
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
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not get location: $e')),
        );
      }
    }
  }

  @override
  void dispose() {
    _descriptionController.dispose();
    super.dispose();
  }

  // Matches the 9 incident types in features.md's M-13 (Incident Reporting)
  // and the backend's IncidentTypeEnum -- see the enum's own doc comment in
  // incident_cubit.dart for why these specific values.
  static const _typeIcons = <IncidentType, IconData>{
    IncidentType.kidnapping: Icons.person_search_outlined,
    IncidentType.armed_robbery: Icons.security_outlined,
    IncidentType.accident: Icons.car_crash_outlined,
    IncidentType.roadblock: Icons.block,
    IncidentType.police_checkpoint: Icons.local_police_outlined,
    IncidentType.fake_checkpoint: Icons.report_problem_outlined,
    IncidentType.bad_road: Icons.warning_amber_outlined,
    IncidentType.vehicle_breakdown: Icons.car_repair_outlined,
    IncidentType.suspicious_activity: Icons.visibility_outlined,
  };

  static const _typeLabels = <IncidentType, String>{
    IncidentType.kidnapping: 'Kidnapping',
    IncidentType.armed_robbery: 'Armed Robbery',
    IncidentType.accident: 'Accident',
    IncidentType.roadblock: 'Roadblock',
    IncidentType.police_checkpoint: 'Police Checkpoint',
    IncidentType.fake_checkpoint: 'Fake Checkpoint',
    IncidentType.bad_road: 'Bad Road',
    IncidentType.vehicle_breakdown: 'Vehicle Breakdown',
    IncidentType.suspicious_activity: 'Suspicious',
  };

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
                if (state.latitude != null)
                  Row(
                    children: [
                      const Icon(Icons.location_on, size: 16, color: Colors.green),
                      const SizedBox(width: 4),
                      Text(
                        'Location: ${state.latitude!.toStringAsFixed(4)}, ${state.longitude!.toStringAsFixed(4)}',
                        style: const TextStyle(fontSize: 12, color: Colors.green),
                      ),
                    ],
                  )
                else
                  const Row(
                    children: [
                      SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                      SizedBox(width: 8),
                      Text('Getting location...', style: TextStyle(fontSize: 12, color: Colors.grey)),
                    ],
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
