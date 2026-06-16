/// Trip Registration Screen — Driver and Passenger mode forms.
///
/// Adapts based on whether the user is driving their own vehicle
/// or travelling via public/commercial transport. Supports:
/// - Draft saving
/// - Immediate trip start with wallet auto-deduction
///
/// Google Places autocomplete for origin/destination is deferred to Week 3.
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme.dart';
import '../../../app/router.dart';
import '../../../core/constants.dart';
import '../cubit/trip_registration_cubit.dart';

class TripRegistrationScreen extends StatefulWidget {
  const TripRegistrationScreen({super.key});

  @override
  State<TripRegistrationScreen> createState() => _TripRegistrationScreenState();
}

class _TripRegistrationScreenState extends State<TripRegistrationScreen> {
  late final TripRegistrationCubit _cubit;

  final _originController = TextEditingController();
  final _destinationController = TextEditingController();
  final _transportCompanyController = TextEditingController();
  final _driverNameController = TextEditingController();
  final _driverPhoneController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _cubit = context.read<TripRegistrationCubit>();

    // Load saved vehicles and populate driver info from profile.
    // In a real app, driverName/driverPhone would come from the ProfileCubit.
    _cubit.loadSavedVehicles('', null);
  }

  @override
  void dispose() {
    _originController.dispose();
    _destinationController.dispose();
    _transportCompanyController.dispose();
    _driverNameController.dispose();
    _driverPhoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<TripRegistrationCubit, TripRegistrationState>(
      listener: (context, state) {
        if (state.status == TripFormStatus.started &&
            state.startedTripId != null) {
          // Navigate to the active trip monitoring screen.
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Trip monitoring started! Stay safe.'),
            ),
          );
          context.go(AppRoutes.home);
        }
        if (state.status == TripFormStatus.draftSaved) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Trip saved as draft. Start when ready.'),
            ),
          );
        }
      },
      builder: (context, state) {
        return Scaffold(
          appBar: AppBar(
            title: const Text('Start New Trip'),
            centerTitle: true,
            actions: [
              IconButton(
                icon: const Icon(Icons.qr_code_scanner),
                tooltip: 'Scan Vehicle QR',
                onPressed: () => context.push(AppRoutes.qrScanner),
              ),
              IconButton(
                icon: const Icon(Icons.history),
                tooltip: 'Trip History',
                onPressed: () => context.push(AppRoutes.tripHistory),
              ),
            ],
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ── Mode Toggle ──
                _buildModeToggle(state),
                const SizedBox(height: 20),

                // ── Driver Mode Fields ──
                if (state.tripMode == TripMode.driver) ...[
                  _buildVehicleSelector(state),
                  const SizedBox(height: 16),
                  _buildDriverInfo(state),
                  const SizedBox(height: 16),
                ],

                // ── Passenger Mode Fields ──
                if (state.tripMode == TripMode.passenger) ...[
                  _buildTransportCompanyField(state),
                  const SizedBox(height: 16),
                ],

                // ── Common Fields ──
                _buildLocationField(
                  controller: _originController,
                  label: 'Origin',
                  hint: 'e.g., Lagos, Ikeja',
                  icon: Icons.trip_origin,
                ),
                const SizedBox(height: 12),
                _buildLocationField(
                  controller: _destinationController,
                  label: 'Destination',
                  hint: 'e.g., Benin, Ring Road',
                  icon: Icons.flag_outlined,
                ),
                const SizedBox(height: 12),

                // ── Passenger Count ──
                _buildPassengerCount(state),
                const SizedBox(height: 24),

                // ── Cost Hint ──
                _buildCostHint(),
                const SizedBox(height: 16),

                // ── Error Banner ──
                if (state.errorMessage != null) ...[
                  _buildErrorBanner(state.errorMessage!),
                  const SizedBox(height: 16),
                ],

                // ── Actions ──
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed:
                            state.status == TripFormStatus.submitting
                                ? null
                                : () => _cubit.saveDraft(),
                        icon: const Icon(Icons.bookmark_outline, size: 18),
                        label: const Text('Save Draft'),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: FilledButton.icon(
                        onPressed:
                            state.isFormValid &&
                                    state.status != TripFormStatus.submitting
                                ? () => _cubit.startTrip()
                                : null,
                        icon:
                            state.status == TripFormStatus.submitting
                                ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                                : const Icon(Icons.play_arrow, size: 18),
                        label: Text(
                          state.status == TripFormStatus.submitting
                              ? 'Starting...'
                              : 'Start Monitoring',
                        ),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.safetyGreen,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 32),
              ],
            ),
          ),
        );
      },
    );
  }

  // ──────────────────────────────────────────────────────────
  // Widget builders
  // ──────────────────────────────────────────────────────────

  Widget _buildModeToggle(TripRegistrationState state) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.darkSlate.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
      ),
      padding: const EdgeInsets.all(4),
      child: Row(
        children: [
          Expanded(
            child: _ModeToggleChip(
              label: "I'm driving",
              isSelected: state.tripMode == TripMode.driver,
              onTap: () => _cubit.setTripMode(TripMode.driver),
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: _ModeToggleChip(
              label: "I'm a passenger",
              isSelected: state.tripMode == TripMode.passenger,
              onTap: () => _cubit.setTripMode(TripMode.passenger),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVehicleSelector(TripRegistrationState state) {
    final vehicles = state.savedVehicles;
    final selected = state.selectedVehicle;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Vehicle', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        if (vehicles.isEmpty)
          _buildEmptyVehiclesCard()
        else
          DropdownButtonFormField<String>(
            initialValue: selected?.id,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.directions_car_outlined),
              border: OutlineInputBorder(),
            ),
            items:
                vehicles.map((v) {
                  return DropdownMenuItem(
                    value: v.id,
                    child: Text(
                      '${v.plateNumber} — ${v.make ?? ''} ${v.model ?? ''}'
                          .trim(),
                    ),
                  );
                }).toList(),
            onChanged: (id) {
              if (id != null) _cubit.selectVehicle(id);
            },
          ),
      ],
    );
  }

  Widget _buildEmptyVehiclesCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Icon(Icons.info_outline, color: AppColors.darkSlate),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'No saved vehicles. Add one in Profile > My Vehicles.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            TextButton(
              onPressed: () => context.push(AppRoutes.addVehicle),
              child: const Text('Add'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDriverInfo(TripRegistrationState state) {
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _driverNameController,
            decoration: const InputDecoration(
              labelText: 'Driver Name',
              prefixIcon: Icon(Icons.person_outline),
              border: OutlineInputBorder(),
            ),
            onChanged: (v) => _cubit.setDriverName(v),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: TextField(
            controller: _driverPhoneController,
            decoration: const InputDecoration(
              labelText: 'Driver Phone',
              prefixIcon: Icon(Icons.phone_outlined),
              border: OutlineInputBorder(),
            ),
            keyboardType: TextInputType.phone,
            onChanged: (v) => _cubit.setDriverPhone(v),
          ),
        ),
      ],
    );
  }

  Widget _buildTransportCompanyField(TripRegistrationState state) {
    return TextField(
      controller: _transportCompanyController,
      decoration: InputDecoration(
        labelText: 'Transport Company (optional)',
        hintText: 'e.g., ABC Transport, God is Good Motors',
        prefixIcon: const Icon(Icons.business_outlined),
        border: const OutlineInputBorder(),
        suffixIcon: IconButton(
          icon: const Icon(Icons.qr_code_scanner),
          tooltip: 'Scan transport company QR',
          onPressed: () {
            // TODO: QR scanner for transport partner vehicles (M-17, Week 4)
          },
        ),
      ),
      onChanged: (v) => _cubit.setTransportCompany(v.isNotEmpty ? v : null),
    );
  }

  Widget _buildLocationField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icon,
  }) {
    return TextField(
      controller: controller,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icon),
        border: const OutlineInputBorder(),
      ),
    );
  }

  Widget _buildPassengerCount(TripRegistrationState state) {
    return Row(
      children: [
        const Icon(Icons.people_outline, color: AppColors.darkSlate),
        const SizedBox(width: 12),
        Text('Passengers', style: Theme.of(context).textTheme.bodyMedium),
        const Spacer(),
        IconButton(
          icon: const Icon(Icons.remove_circle_outline),
          onPressed:
              state.passengerCount > 1
                  ? () => _cubit.setPassengerCount(state.passengerCount - 1)
                  : null,
        ),
        Text(
          '${state.passengerCount}',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        IconButton(
          icon: const Icon(Icons.add_circle_outline),
          onPressed: () => _cubit.setPassengerCount(state.passengerCount + 1),
        ),
      ],
    );
  }

  Widget _buildCostHint() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.safetyGreen.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.safetyGreen.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.info_outline,
            color: AppColors.safetyGreen,
            size: 18,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Trip monitoring costs ₦${kTripPriceNaira}. '
              'Auto-deducted from your wallet on Start.',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AppColors.darkSlate),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorBanner(String message) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.emergencyRed.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: AppColors.emergencyRed.withValues(alpha: 0.3),
        ),
      ),
      child: Text(
        message,
        style: Theme.of(
          context,
        ).textTheme.bodySmall?.copyWith(color: AppColors.emergencyRed),
      ),
    );
  }
}

/// Chip-style toggle for driver/passenger mode selection.
class _ModeToggleChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _ModeToggleChip({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          boxShadow:
              isSelected
                  ? [
                    BoxShadow(
                      color: Colors.black12.withValues(alpha: 0.1),
                      blurRadius: 4,
                    ),
                  ]
                  : null,
        ),
        child: Center(
          child: Text(
            label,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
              color:
                  isSelected
                      ? AppColors.darkSlate
                      : AppColors.darkSlate.withValues(alpha: 0.6),
            ),
          ),
        ),
      ),
    );
  }
}
