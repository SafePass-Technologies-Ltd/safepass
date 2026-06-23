/// Schedule Trip Sheet (Screen 21b) — create a new scheduled/future trip.
///
/// Opened as a modal bottom sheet from either:
///  - The trip registration screen ("Schedule Trip" button) — destination pre-filled.
///  - The scheduled trips screen FAB — destination must be entered manually.
///
/// When the destination is not pre-filled, the destination field behaves like the
/// trip registration form: 350 ms debounced autocomplete via
/// `GET /v1/geocoding/autocomplete`, with a suggestions dropdown, followed by a
/// place-ID resolve via `GET /v1/geocoding/place` to store lat/lng.
///
/// On save, emits to [ScheduledTripsCubit] and pops the sheet.
/// The caller is responsible for navigating to the scheduled trips screen after.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../app/theme.dart';
import '../../../core/api/api_client.dart';
import '../cubit/scheduled_trips_cubit.dart';
import '../cubit/trip_registration_cubit.dart' show PlaceLocation, PlaceSuggestion;

class ScheduleTripSheet extends StatefulWidget {
  /// If coming from the trip registration form, this is the already-selected
  /// destination and will be displayed as read-only.
  final PlaceLocation? prefillDestination;

  const ScheduleTripSheet({super.key, this.prefillDestination});

  @override
  State<ScheduleTripSheet> createState() => _ScheduleTripSheetState();
}

class _ScheduleTripSheetState extends State<ScheduleTripSheet> {
  final _labelController = TextEditingController();
  final _transportController = TextEditingController();
  final _destinationController = TextEditingController();

  /// The resolved destination (either pre-filled or entered + resolved via API).
  PlaceLocation? _destination;

  // ── Autocomplete state ────────────────────────────────────
  List<PlaceSuggestion> _suggestions = [];
  bool _isSearching = false;
  Timer? _debounce;

  final _dio = ApiClient.instance.dio;

  DateTime? _selectedDate;
  TimeOfDay? _selectedTime;

  @override
  void initState() {
    super.initState();
    if (widget.prefillDestination != null) {
      _destination = widget.prefillDestination;
      _destinationController.text = widget.prefillDestination!.name ?? '';
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _labelController.dispose();
    _transportController.dispose();
    _destinationController.dispose();
    super.dispose();
  }

  // ── Autocomplete logic ────────────────────────────────────

  /// Trigger autocomplete with 350 ms debounce. Clears [_destination] so the
  /// form is invalid until the user picks a resolved suggestion.
  void _onDestinationChanged(String query) {
    // Clear previously resolved location whenever the user edits the text.
    _destination = null;

    _debounce?.cancel();

    if (query.trim().isEmpty) {
      setState(() {
        _suggestions = [];
        _isSearching = false;
      });
      return;
    }

    setState(() => _isSearching = true);

    _debounce = Timer(const Duration(milliseconds: 350), () async {
      try {
        final response = await _dio.get(
          '/v1/geocoding/autocomplete',
          queryParameters: {'query': query.trim()},
        );
        final results = (response.data['data'] as List<dynamic>? ?? [])
            .map((item) => PlaceSuggestion.fromJson(item as Map<String, dynamic>))
            .toList();
        if (mounted) {
          setState(() {
            _suggestions = results;
            _isSearching = false;
          });
        }
      } catch (_) {
        if (mounted) {
          setState(() {
            _suggestions = [];
            _isSearching = false;
          });
        }
      }
    });
  }

  /// Resolve the selected [suggestion]'s place ID to a [PlaceLocation] with
  /// real lat/lng from `GET /v1/geocoding/place`.
  Future<void> _selectSuggestion(PlaceSuggestion suggestion) async {
    // Show the suggestion name immediately; spinner indicates resolution in progress.
    _destinationController.text = suggestion.name;
    setState(() {
      _suggestions = [];
      _isSearching = true;
    });

    try {
      final response = await _dio.get(
        '/v1/geocoding/place',
        queryParameters: {'placeId': suggestion.placeId},
      );
      final data = response.data['data'] as Map<String, dynamic>;
      final resolved = PlaceLocation(
        name: data['name'] as String? ?? suggestion.name,
        latitude: (data['lat'] as num).toDouble(),
        longitude: (data['lng'] as num).toDouble(),
      );
      if (mounted) {
        setState(() {
          _destination = resolved;
          _isSearching = false;
          // Keep field text in sync with the canonical place name.
          _destinationController.text = resolved.name ?? suggestion.name;
        });
      }
    } catch (_) {
      // Resolution failed — clear the resolved location so the form stays invalid
      // and the user can retry by retyping.
      if (mounted) {
        setState(() {
          _destination = null;
          _isSearching = false;
        });
      }
    }
  }

  // ── Validation ────────────────────────────────────────────

  bool get _isFormValid {
    if (_destination == null) return false;
    if (_selectedDate == null || _selectedTime == null) return false;
    final scheduled = _combinedDateTime;
    if (scheduled == null) return false;
    return scheduled.isAfter(DateTime.now());
  }

  DateTime? get _combinedDateTime {
    if (_selectedDate == null || _selectedTime == null) return null;
    return DateTime(
      _selectedDate!.year,
      _selectedDate!.month,
      _selectedDate!.day,
      _selectedTime!.hour,
      _selectedTime!.minute,
    );
  }

  // ── Date / Time pickers ───────────────────────────────────

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate ?? now.add(const Duration(days: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() => _selectedDate = picked);
    }
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _selectedTime ?? TimeOfDay.now(),
    );
    if (picked != null) {
      setState(() => _selectedTime = picked);
    }
  }

  // ── Save ─────────────────────────────────────────────────

  Future<void> _save() async {
    if (!_isFormValid) return;

    final cubit = context.read<ScheduledTripsCubit>();
    await cubit.createScheduledTrip(
      destination: _destination!,
      scheduledAt: _combinedDateTime!,
      label: _labelController.text.trim().isNotEmpty
          ? _labelController.text.trim()
          : null,
      transportCompany: _transportController.text.trim().isNotEmpty
          ? _transportController.text.trim()
          : null,
    );

    if (!mounted) return;

    // Pop the sheet with true to signal a trip was saved — the caller uses this
    // to decide whether to navigate to the scheduled trips screen.
    Navigator.of(context).pop(true);
  }

  // ── Build ─────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<ScheduledTripsCubit, ScheduledTripsState>(
      listener: (context, state) {
        if (state.errorMessage != null && !state.isMutating) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(state.errorMessage!),
              backgroundColor: AppColors.emergencyRed,
            ),
          );
        }
      },
      builder: (context, state) {
        final isSaving = state.isMutating;

        return SingleChildScrollView(
          // Keeps the form visible and scrollable when the keyboard is open.
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(context).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── Handle ──
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // ── Title ──
              Text(
                'Schedule a Trip',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 20),

              // ── Label (optional) ──
              TextField(
                controller: _labelController,
                decoration: const InputDecoration(
                  labelText: 'Trip Label (optional)',
                  hintText: 'e.g., Lagos trip, Holiday travel',
                  prefixIcon: Icon(Icons.label_outline),
                  border: OutlineInputBorder(),
                ),
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 12),

              // ── Destination ──
              _buildDestinationField(),
              const SizedBox(height: 12),

              // ── Date + Time pickers ──
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _pickDate,
                      icon: const Icon(Icons.calendar_today_outlined, size: 18),
                      label: Text(
                        _selectedDate != null
                            ? '${_selectedDate!.day}/${_selectedDate!.month}/${_selectedDate!.year}'
                            : 'Pick Date *',
                      ),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        foregroundColor: _selectedDate != null
                            ? AppColors.darkSlate
                            : AppColors.primary,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _pickTime,
                      icon: const Icon(Icons.access_time_outlined, size: 18),
                      label: Text(
                        _selectedTime != null
                            ? _selectedTime!.format(context)
                            : 'Pick Time *',
                      ),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        foregroundColor: _selectedTime != null
                            ? AppColors.darkSlate
                            : AppColors.primary,
                      ),
                    ),
                  ),
                ],
              ),
              // Show validation hint if date is in the past
              if (_combinedDateTime != null &&
                  !_combinedDateTime!.isAfter(DateTime.now())) ...[
                const SizedBox(height: 6),
                Text(
                  'Please pick a future date and time.',
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: AppColors.emergencyRed),
                ),
              ],
              const SizedBox(height: 12),

              // ── Transport Company (optional) ──
              TextField(
                controller: _transportController,
                decoration: const InputDecoration(
                  labelText: 'Transport Company (optional)',
                  hintText: 'e.g., ABC Transport',
                  prefixIcon: Icon(Icons.business_outlined),
                  border: OutlineInputBorder(),
                ),
                textInputAction: TextInputAction.done,
              ),
              const SizedBox(height: 16),

              // ── Reminder note ──
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                      color: AppColors.primary.withValues(alpha: 0.25)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.notifications_outlined,
                        size: 16, color: AppColors.primary),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'You\'ll receive a reminder 30 minutes before your scheduled time.',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: AppColors.darkSlate,
                            ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // ── Save Button ──
              FilledButton(
                onPressed: (_isFormValid && !isSaving) ? _save : null,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: isSaving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'Save Scheduled Trip',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
              ),
            ],
          ),
        );
      },
    );
  }

  // ── Destination field + autocomplete dropdown ─────────────

  Widget _buildDestinationField() {
    // Pre-filled from trip registration form — display as read-only.
    if (widget.prefillDestination != null) {
      return InputDecorator(
        decoration: const InputDecoration(
          labelText: 'Destination',
          prefixIcon: Icon(Icons.flag_outlined),
          border: OutlineInputBorder(),
        ),
        child: Text(
          _destination?.name ?? '',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
      );
    }

    // Manual entry with autocomplete.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _destinationController,
          decoration: InputDecoration(
            labelText: 'Destination *',
            hintText: 'e.g., Benin, Ring Road',
            prefixIcon: const Icon(Icons.flag_outlined),
            suffixIcon: _isSearching
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                : null,
            border: const OutlineInputBorder(),
          ),
          onChanged: _onDestinationChanged,
        ),
        // Suggestions dropdown — capped at 200 px so it never overflows the
        // bottom sheet. Scrolls internally when there are more results.
        if (_suggestions.isNotEmpty)
          Card(
            margin: const EdgeInsets.only(top: 2),
            elevation: 4,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 200),
              child: ListView.builder(
                padding: EdgeInsets.zero,
                shrinkWrap: true,
                itemCount: _suggestions.length,
                itemBuilder: (context, index) {
                  final suggestion = _suggestions[index];
                  return ListTile(
                    leading: const Icon(Icons.location_on_outlined),
                    title: Text(suggestion.name),
                    subtitle: suggestion.secondaryText != null
                        ? Text(
                            suggestion.secondaryText!,
                            style: Theme.of(context).textTheme.bodySmall,
                          )
                        : null,
                    onTap: () => _selectSuggestion(suggestion),
                  );
                },
              ),
            ),
          ),
      ],
    );
  }
}
