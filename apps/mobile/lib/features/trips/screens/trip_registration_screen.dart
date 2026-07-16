/// Trip Registration Screen — unified trip creation form.
///
/// Supports GPS-based origin auto-detection, destination search with
/// autocomplete, optional transport company, passenger count, and org tagging.
///
/// When opened from a scheduled trip card (Start Trip), pass the destination
/// as [GoRouterState.extra] (a [PlaceLocation]) to pre-fill the field.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme.dart';
import '../../../app/router.dart';
import '../../../core/constants.dart';
import '../cubit/trip_registration_cubit.dart';
import '../cubit/trip_monitoring_cubit.dart';
import '../cubit/scheduled_trips_cubit.dart';
import '../../profile/cubit/profile_cubit.dart';
import 'schedule_trip_sheet.dart';

class TripRegistrationScreen extends StatefulWidget {
  /// Optional destination to pre-fill when coming from "Start Trip" on a
  /// scheduled trip card.
  final PlaceLocation? prefillDestination;

  const TripRegistrationScreen({super.key, this.prefillDestination});

  @override
  State<TripRegistrationScreen> createState() => _TripRegistrationScreenState();
}

class _TripRegistrationScreenState extends State<TripRegistrationScreen> {
  late final TripRegistrationCubit _cubit;

  final _originController = TextEditingController();
  final _destinationController = TextEditingController();
  final _vehiclePlateController = TextEditingController();
  final _vehicleDescriptionController = TextEditingController();
  final _transportCompanyController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _cubit = context.read<TripRegistrationCubit>();
    // Auto-detect GPS location on open
    _cubit.detectLocation();

    // If a trip is already active when the user lands here (e.g. they navigated
    // back from the active trip screen), redirect them immediately so they
    // cannot start a second trip on top of the active one.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final tripState = context.read<TripMonitoringCubit>().state;
      if ((tripState.status == TripMonitorStatus.active ||
              tripState.status == TripMonitorStatus.gpsUpdating) &&
          tripState.trip != null) {
        context.go('/trip/active/${tripState.trip!.id}');
      }
    });

    // Seed org membership from the profile cubit so the "Tag a member" section
    // is shown for corporate / transport partner members.
    final profileState = context.read<ProfileCubit>().state;
    final membership = profileState.orgMembership;
    _cubit.setOrgMembership(
      isOrgMember: membership != null,
      orgId: membership?.orgId,
    );
    if (membership != null &&
        (membership.orgType == 'transport_partner')) {
      _cubit.setIsTransportPartner(value: true);
    }

    // Pre-fill destination if coming from a scheduled trip card ("Start Trip").
    final prefill = widget.prefillDestination;
    if (prefill != null) {
      _destinationController.text = prefill.name ?? '';
      _cubit.setDestination(prefill);
    }
  }

  @override
  void dispose() {
    _originController.dispose();
    _destinationController.dispose();
    _vehiclePlateController.dispose();
    _vehicleDescriptionController.dispose();
    _transportCompanyController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Outer listener: redirects to the active trip screen if a trip becomes
    // active while the user is on this screen (e.g. resume from background).
    return BlocListener<TripMonitoringCubit, TripMonitoringState>(
      listenWhen: (prev, curr) =>
          (curr.status == TripMonitorStatus.active ||
              curr.status == TripMonitorStatus.gpsUpdating) &&
          curr.trip != null &&
          prev.status != TripMonitorStatus.active,
      listener: (context, state) =>
          context.go('/trip/active/${state.trip!.id}'),
      child: BlocConsumer<TripRegistrationCubit, TripRegistrationState>(
        listener: (context, state) {
        // Sync origin text field when GPS resolves
        if (state.origin?.name != null &&
            _originController.text != state.origin!.name) {
          _originController.text = state.origin!.name!;
        }

        if (state.status == TripFormStatus.started &&
            state.startedTripId != null) {
          final tripId = state.startedTripId!;
          context.read<TripMonitoringCubit>().startMonitoring(tripId);
          context.go('/trip/active/$tripId');
        }

        // draftSaved status is no longer used — scheduling is handled by the sheet.
      },
      builder: (context, state) {
        return Scaffold(
          appBar: AppBar(
            title: const Text('Start New Trip'),
            centerTitle: true,
            actions: [
              IconButton(
                icon: const Icon(Icons.calendar_month_outlined),
                tooltip: 'Scheduled Trips',
                onPressed: () => context.push(AppRoutes.scheduledTrips),
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
                // ── 1 & 2. Where to? (collapsed origin + destination) ──
                _buildWhereToBlock(state),
                const SizedBox(height: 12),

                // ── 3. Vehicle Info (plate + description) ──
                _buildVehiclePlateField(state),
                const SizedBox(height: 8),
                _buildVehicleDescriptionField(state),
                const SizedBox(height: 12),

                // ── 4. Transport Company ──
                _buildTransportCompanySection(state),
                const SizedBox(height: 16),

                // ── 5. Org Tag Section ──
                if (state.isOrgMember) ...[
                  _buildOrgTagSection(state),
                  const SizedBox(height: 16),
                ],

                // ── Cost Hint ──
                _buildCostHint(state),
                const SizedBox(height: 12),

                // ── Error Banner ──
                if (state.errorMessage != null) ...[
                  _buildErrorBanner(state.errorMessage!),
                  const SizedBox(height: 12),
                ],

                // ── Actions ──
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: state.status == TripFormStatus.submitting
                            ? null
                            : () => _openScheduleSheet(context, state),
                        icon: const Icon(Icons.calendar_month_outlined, size: 18),
                        label: const Text('Schedule Trip'),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: FilledButton.icon(
                        onPressed: state.isFormValid &&
                                state.status != TripFormStatus.submitting
                            ? () => _requestAlwaysLocationThenStart(context)
                            : null,
                        icon: state.status == TripFormStatus.submitting
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
                              : state.isOrgMember
                                  ? 'Start Monitoring — No charge'
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
      ),
    );
  }

  // ──────────────────────────────────────────────────────────
  // Permission request + trip start
  // ──────────────────────────────────────────────────────────

  /// Request background location permission before starting the trip.
  ///
  /// Background location is required so the foreground service can upload
  /// GPS positions when the user minimises the app. If the user denies the
  /// "always" permission the trip still starts with "while in use" tracking,
  /// degrading gracefully rather than blocking the flow entirely.
  Future<void> _requestAlwaysLocationThenStart(BuildContext context) async {
    final status = await Permission.locationAlways.request();

    if (status.isPermanentlyDenied && context.mounted) {
      // Inform the user and offer a shortcut to Settings, but don't block.
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text(
            'Background location denied. Trip tracking will only work while the app is open.',
          ),
          action: SnackBarAction(
            label: 'Settings',
            onPressed: openAppSettings,
          ),
          duration: const Duration(seconds: 5),
        ),
      );
    }

    // Always proceed — foreground-only tracking is better than no tracking.
    _cubit.startTrip();
  }

  // ──────────────────────────────────────────────────────────
  // Scheduled trip sheet
  // ──────────────────────────────────────────────────────────

  /// Open Screen 21b as a modal bottom sheet, pre-filling the destination from
  /// the current form state. After the sheet closes navigate to Screen 21 so
  /// the user can see their new scheduled trip.
  Future<void> _openScheduleSheet(
    BuildContext context,
    TripRegistrationState state,
  ) async {
    // Destination is optional here — the sheet accepts a null prefill.
    final destination = state.destination;

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => BlocProvider(
        create: (_) => ScheduledTripsCubit(),
        child: ScheduleTripSheet(prefillDestination: destination),
      ),
    );

    // Only navigate to Screen 21 when the sheet was closed via save (result == true).
    // A swipe-down, tap-outside, or back-button dismiss returns null, so we stay put.
    if (saved == true && context.mounted) {
      unawaited(context.push(AppRoutes.scheduledTrips));
    }
  }

  // ──────────────────────────────────────────────────────────
  // Widget builders
  // ──────────────────────────────────────────────────────────

  /// Collapsed "Where to?" summary block.
  ///
  /// Shows a plain "Where to?" prompt until both origin and destination are
  /// set, then collapses to "From X to Y". Tapping either state opens the
  /// expandable sheet ([_openWhereToSheet]) where the origin/destination
  /// fields and recent-destinations quick-pick live. This mirrors the
  /// "collapsed summary → tap to expand" pattern already used elsewhere in
  /// this flow (see "Schedule Trip" and "Tag a member" bottom sheets below).
  Widget _buildWhereToBlock(TripRegistrationState state) {
    final originName = state.origin?.name?.trim();
    final destinationName = state.destination?.name?.trim();
    final hasOrigin = originName != null && originName.isNotEmpty;
    final hasDestination = destinationName != null && destinationName.isNotEmpty;

    final String title;
    if (hasDestination) {
      title = hasOrigin ? 'From $originName to $destinationName' : destinationName;
    } else {
      title = 'Where to?';
    }

    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => _openWhereToSheet(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.darkSlate.withValues(alpha: 0.15)),
        ),
        child: Row(
          children: [
            Icon(
              Icons.search,
              color: hasDestination ? AppColors.darkSlate : AppColors.primary,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontWeight:
                              hasDestination ? FontWeight.w600 : FontWeight.w500,
                          color: hasDestination
                              ? AppColors.darkSlate
                              : AppColors.primary,
                        ),
                  ),
                  if (!hasDestination || !hasOrigin)
                    Text(
                      'Tap to set origin & destination',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: AppColors.darkSlate.withValues(alpha: 0.5),
                          ),
                    ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: Colors.grey),
          ],
        ),
      ),
    );
  }

  /// Opens the "Where to?" bottom sheet — origin field, destination field
  /// (both with their existing GPS-detect / autocomplete behavior unchanged)
  /// plus a "Recent destinations" quick-pick list sourced from
  /// `GET /v1/trips/destinations/recent`.
  ///
  /// Uses a [BlocBuilder] (rather than relying on the outer screen's
  /// BlocConsumer) because the sheet is pushed as a separate route by
  /// [showModalBottomSheet] and needs its own subscription to rebuild when
  /// GPS/autocomplete state changes while the sheet is open.
  Future<void> _openWhereToSheet(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        return BlocBuilder<TripRegistrationCubit, TripRegistrationState>(
          bloc: _cubit,
          builder: (context, state) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Handle bar
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
                    Text(
                      'Where to?',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    const SizedBox(height: 20),

                    _buildOriginField(state),
                    const SizedBox(height: 12),
                    _buildDestinationField(state),
                    const SizedBox(height: 16),

                    _RecentDestinationsSection(
                      cubit: _cubit,
                      onSelect: (recent) {
                        _destinationController.text =
                            recent.destination.name ?? '';
                        _cubit.setDestination(recent.destination);
                      },
                    ),
                    const SizedBox(height: 20),

                    FilledButton(
                      onPressed: state.isFormValid
                          ? () => Navigator.of(sheetContext).pop()
                          : null,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.safetyGreen,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      child: const Text(
                        'Done',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildOriginField(TripRegistrationState state) {
    Widget suffixIcon;
    if (state.isGpsLocating) {
      suffixIcon = const Padding(
        padding: EdgeInsets.all(12),
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    } else {
      suffixIcon = IconButton(
        icon: const Icon(Icons.my_location),
        tooltip: 'Detect my location',
        onPressed: () => _cubit.detectLocation(),
      );
    }

    String? helperText;
    if (state.isGpsDenied) {
      helperText = 'Location permission denied. Enter your starting point manually.';
    } else if (state.isGpsTimeout) {
      helperText = 'GPS timed out. Enter your starting point manually.';
    }

    return TextField(
      controller: _originController,
      enabled: !state.isGpsLocating,
      decoration: InputDecoration(
        labelText: 'Origin *',
        hintText: state.isGpsLocating ? 'Detecting location…' : 'e.g., Lagos, Ikeja',
        prefixIcon: const Icon(Icons.trip_origin),
        suffixIcon: suffixIcon,
        border: const OutlineInputBorder(),
        helperText: helperText,
        helperMaxLines: 2,
        helperStyle: TextStyle(color: AppColors.emergencyRed.withValues(alpha: 0.8)),
      ),
      onChanged: (v) {
        if (v.isNotEmpty) {
          _cubit.setOrigin(PlaceLocation(
            name: v,
            // Use placeholder coords — will be resolved on backend if needed
            latitude: 0,
            longitude: 0,
          ));
        }
      },
    );
  }

  Widget _buildDestinationField(TripRegistrationState state) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _destinationController,
          decoration: InputDecoration(
            labelText: 'Destination *',
            hintText: 'e.g., Benin, Ring Road',
            prefixIcon: const Icon(Icons.flag_outlined),
            suffixIcon: state.isSearchingDestination
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
          onChanged: (v) {
            // Clear selected destination when user types
            if (state.destination != null) {
              _cubit.setDestination(PlaceLocation(
                name: v,
                latitude: 0,
                longitude: 0,
              ));
            }
            _cubit.searchDestination(v);
          },
        ),
        // Suggestions dropdown
        if (state.destinationSuggestions.isNotEmpty)
          Card(
            margin: const EdgeInsets.only(top: 2),
            elevation: 4,
            child: Column(
              children: state.destinationSuggestions.map((suggestion) {
                return ListTile(
                  leading: const Icon(Icons.location_on_outlined),
                  title: Text(suggestion.name),
                  subtitle: suggestion.secondaryText != null
                      ? Text(
                          suggestion.secondaryText!,
                          style: Theme.of(context).textTheme.bodySmall,
                        )
                      : null,
                  onTap: () {
                    _destinationController.text = suggestion.name;
                    _cubit.selectDestination(suggestion);
                  },
                );
              }).toList(),
            ),
          ),
      ],
    );
  }

  /// Vehicle plate number — optional for regular users, but required before
  /// tagging org members (gate enforced by [state.canTagMember]).
  Widget _buildVehiclePlateField(TripRegistrationState state) {
    return TextField(
      controller: _vehiclePlateController,
      textCapitalization: TextCapitalization.characters,
      decoration: const InputDecoration(
        labelText: 'Vehicle Plate Number',
        hintText: 'e.g., ABC-123-XY',
        prefixIcon: Icon(Icons.directions_car_outlined),
        border: OutlineInputBorder(),
      ),
      onChanged: (v) => _cubit.setVehiclePlateNumber(v),
    );
  }

  /// Optional free-text description of the vehicle (colour, model, markings).
  Widget _buildVehicleDescriptionField(TripRegistrationState state) {
    return TextField(
      controller: _vehicleDescriptionController,
      maxLines: 2,
      decoration: const InputDecoration(
        labelText: 'Vehicle Description (optional)',
        hintText: 'e.g., Red Toyota Hiace bus',
        prefixIcon: Icon(Icons.description_outlined),
        border: OutlineInputBorder(),
      ),
      onChanged: (v) => _cubit.setVehicleDescription(v),
    );
  }

  Widget _buildTransportCompanySection(TripRegistrationState state) {
    // Transport partner members: company is auto-filled server-side from the
    // org. Show a read-only helper so the user understands the field value.
    if (state.isTransportPartner) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.darkSlate.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.darkSlate.withValues(alpha: 0.2)),
        ),
        child: Row(
          children: [
            const Icon(Icons.business_outlined,
                color: AppColors.darkSlate, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Transport Company',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: AppColors.darkSlate.withValues(alpha: 0.6),
                        ),
                  ),
                  Text(
                    state.transportCompany ?? 'Auto-filled from your organisation',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: AppColors.darkSlate,
                          fontWeight: FontWeight.w500,
                        ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.lock_outline, size: 16, color: AppColors.darkSlate),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!state.transportCompanySkipped) ...[
          TextField(
            controller: _transportCompanyController,
            decoration: InputDecoration(
              labelText: 'Transport Company',
              hintText: 'e.g., ABC Transport, God is Good Motors',
              prefixIcon: const Icon(Icons.business_outlined),
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(
                icon: const Icon(Icons.qr_code_scanner),
                tooltip: 'Scan transport company QR',
                onPressed: () => context.push(AppRoutes.qrScanner),
              ),
            ),
            onChanged: (v) =>
                _cubit.setTransportCompany(v.isNotEmpty ? v : null),
          ),
          const SizedBox(height: 8),
        ],
        CheckboxListTile(
          value: state.transportCompanySkipped,
          onChanged: (checked) {
            if (checked == true) {
              _transportCompanyController.clear();
              _cubit.skipTransportCompany();
            } else {
              _cubit.unSkipTransportCompany();
            }
          },
          title: const Text('Skip / Not applicable'),
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: EdgeInsets.zero,
          dense: true,
        ),
      ],
    );
  }

  /// Org member tagging section — only shown for corporate / transport
  /// partner members ([state.isOrgMember] is true).
  ///
  /// Disabled until a plate number is provided ([state.canTagMember]).
  Widget _buildOrgTagSection(TripRegistrationState state) {
    final canTag = state.canTagMember;
    final tagged = state.taggedMembers;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section header
        Row(
          children: [
            const Icon(Icons.group_add_outlined,
                size: 18, color: AppColors.darkSlate),
            const SizedBox(width: 8),
            Text(
              'Tag a member',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: AppColors.darkSlate,
                  ),
            ),
          ],
        ),
        const SizedBox(height: 6),

        // Gate hint — shown when plate number is missing
        if (!canTag)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(
              'Add a plate number first to enable member tagging.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.darkSlate.withValues(alpha: 0.5),
                    fontStyle: FontStyle.italic,
                  ),
            ),
          ),

        // Chips for already-tagged members
        if (tagged.isNotEmpty) ...[
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: tagged.map((m) {
              return Chip(
                label: Text(m.fullName),
                avatar: const Icon(Icons.person_outline, size: 16),
                onDeleted: () {
                  _cubit.setTaggedMembers(
                    tagged.where((t) => t.userId != m.userId).toList(),
                  );
                },
                deleteIconColor: AppColors.darkSlate.withValues(alpha: 0.6),
                backgroundColor:
                    AppColors.safetyGreen.withValues(alpha: 0.1),
                side: BorderSide(
                  color: AppColors.safetyGreen.withValues(alpha: 0.3),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 8),
        ],

        // "Tag a member" button
        OutlinedButton.icon(
          onPressed: canTag ? () => _openMemberPicker(state) : null,
          icon: const Icon(Icons.person_add_outlined, size: 18),
          label: Text(
            tagged.isEmpty ? 'Tag a member' : 'Add more members',
          ),
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.darkSlate,
            side: BorderSide(
              color: canTag
                  ? AppColors.darkSlate.withValues(alpha: 0.4)
                  : AppColors.darkSlate.withValues(alpha: 0.15),
            ),
          ),
        ),
      ],
    );
  }

  /// Open a bottom sheet that lists fellow org members and lets the user
  /// select which ones to tag on this trip.
  Future<void> _openMemberPicker(TripRegistrationState state) async {
    final selected = await showModalBottomSheet<List<OrgMemberModel>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _MemberPickerSheet(
        cubit: _cubit,
        alreadyTagged: state.taggedMembers,
      ),
    );

    if (selected != null) {
      _cubit.setTaggedMembers(selected);
    }
  }

  Widget _buildCostHint(TripRegistrationState state) {
    final isOrgMember = state.isOrgMember;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.safetyGreen.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.safetyGreen.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline, color: AppColors.safetyGreen, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              isOrgMember
                  ? 'Trip monitoring is covered by your organisation.'
                  : 'Trip monitoring costs ₦$kTripPriceNaira. '
                      'Auto-deducted from your wallet on Start.',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: AppColors.darkSlate),
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
        border: Border.all(color: AppColors.emergencyRed.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, color: AppColors.emergencyRed, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  message,
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: AppColors.emergencyRed),
                ),
                if (message.contains('balance')) ...[
                  const SizedBox(height: 6),
                  GestureDetector(
                    onTap: () => context.push(AppRoutes.wallet),
                    child: Text(
                      'Top up wallet →',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: AppColors.emergencyRed,
                            fontWeight: FontWeight.w600,
                            decoration: TextDecoration.underline,
                          ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Recent Destinations Section (inside the "Where to?" sheet)
// ──────────────────────────────────────────────────────────────────────────────

/// Lists the user's most recent distinct past destinations so they can be
/// picked with one tap instead of retyping/re-searching an address.
///
/// Fetches lazily on mount (mirrors [_MemberPickerSheet]'s `_loadMembers`
/// pattern) rather than living in [TripRegistrationState], since this data
/// is only ever needed while the sheet is open.
class _RecentDestinationsSection extends StatefulWidget {
  final TripRegistrationCubit cubit;
  final ValueChanged<RecentDestinationModel> onSelect;

  const _RecentDestinationsSection({
    required this.cubit,
    required this.onSelect,
  });

  @override
  State<_RecentDestinationsSection> createState() =>
      _RecentDestinationsSectionState();
}

class _RecentDestinationsSectionState
    extends State<_RecentDestinationsSection> {
  List<RecentDestinationModel> _destinations = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final result = await widget.cubit.fetchRecentDestinations();
    if (!mounted) return;
    setState(() {
      _destinations = result;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }

    // No trip history yet (or the lookup failed) — stay silent rather than
    // showing an empty-state / error for a non-essential convenience list.
    if (_destinations.isEmpty) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.history,
                size: 16, color: AppColors.darkSlate.withValues(alpha: 0.6)),
            const SizedBox(width: 6),
            Text(
              'Recent destinations',
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: AppColors.darkSlate.withValues(alpha: 0.6),
                  ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        ..._destinations.map((recent) {
          return ListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            leading: const Icon(Icons.location_on_outlined,
                color: AppColors.primary),
            title: Text(
              recent.destination.name ?? 'Unknown destination',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            subtitle: Text(
              _formatRelativeDate(recent.lastTravelledAt),
              style: Theme.of(context).textTheme.bodySmall,
            ),
            onTap: () => widget.onSelect(recent),
          );
        }),
      ],
    );
  }

  /// Formats a past date as a short relative label ("Today", "Yesterday",
  /// "3 days ago") falling back to a plain date once it's over a week old.
  String _formatRelativeDate(DateTime dt) {
    final days = DateTime.now().difference(dt).inDays;
    if (days <= 0) return 'Today';
    if (days == 1) return 'Yesterday';
    if (days < 7) return '$days days ago';
    return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Member Picker Bottom Sheet
// ──────────────────────────────────────────────────────────────────────────────

/// Bottom sheet that loads the user's fellow org members and lets them select
/// who to tag on the current trip.
///
/// Pops with [List<OrgMemberModel>] on confirm, or null on dismiss.
class _MemberPickerSheet extends StatefulWidget {
  final TripRegistrationCubit cubit;
  final List<OrgMemberModel> alreadyTagged;

  const _MemberPickerSheet({
    required this.cubit,
    required this.alreadyTagged,
  });

  @override
  State<_MemberPickerSheet> createState() => _MemberPickerSheetState();
}

class _MemberPickerSheetState extends State<_MemberPickerSheet> {
  List<OrgMemberModel> _members = [];
  bool _loading = true;
  String? _errorMessage;

  /// Currently selected user IDs.
  late Set<String> _selectedIds;

  @override
  void initState() {
    super.initState();
    _selectedIds = widget.alreadyTagged.map((m) => m.userId).toSet();
    _loadMembers();
  }

  Future<void> _loadMembers() async {
    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    final members = await widget.cubit.fetchOrgMembers();

    if (!mounted) return;
    if (members.isEmpty) {
      setState(() {
        _loading = false;
        _errorMessage = 'No other members found in your organisation.';
      });
    } else {
      setState(() {
        _loading = false;
        _members = members;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      maxChildSize: 0.9,
      builder: (_, scrollController) {
        return Column(
          children: [
            // Handle bar
            const SizedBox(height: 12),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),

            // Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  const Icon(Icons.group_add_outlined,
                      color: AppColors.darkSlate),
                  const SizedBox(width: 10),
                  Text(
                    'Tag a member',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(
                      _members
                          .where((m) => _selectedIds.contains(m.userId))
                          .toList(),
                    ),
                    child: const Text('Confirm'),
                  ),
                ],
              ),
            ),
            const Divider(height: 16),

            // Body — loading / error / list
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _errorMessage != null
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.people_outline,
                                    size: 48, color: AppColors.darkSlate),
                                const SizedBox(height: 12),
                                Text(
                                  _errorMessage!,
                                  textAlign: TextAlign.center,
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodyMedium
                                      ?.copyWith(
                                        color: AppColors.darkSlate
                                            .withValues(alpha: 0.6),
                                      ),
                                ),
                                const SizedBox(height: 16),
                                OutlinedButton(
                                  onPressed: _loadMembers,
                                  child: const Text('Retry'),
                                ),
                              ],
                            ),
                          ),
                        )
                      : ListView.builder(
                          controller: scrollController,
                          itemCount: _members.length,
                          itemBuilder: (_, index) {
                            final member = _members[index];
                            final isSelected =
                                _selectedIds.contains(member.userId);

                            return CheckboxListTile(
                              value: isSelected,
                              onChanged: (checked) {
                                setState(() {
                                  if (checked == true) {
                                    _selectedIds.add(member.userId);
                                  } else {
                                    _selectedIds.remove(member.userId);
                                  }
                                });
                              },
                              title: Text(member.fullName),
                              subtitle: member.phone != null
                                  ? Text(
                                      member.phone!,
                                      style:
                                          Theme.of(context).textTheme.bodySmall,
                                    )
                                  : null,
                              secondary: CircleAvatar(
                                backgroundColor: AppColors.safetyGreen
                                    .withValues(alpha: 0.15),
                                child: Text(
                                  member.fullName.isNotEmpty
                                      ? member.fullName[0].toUpperCase()
                                      : '?',
                                  style: const TextStyle(
                                    color: AppColors.safetyGreen,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              activeColor: AppColors.safetyGreen,
                              controlAffinity: ListTileControlAffinity.trailing,
                            );
                          },
                        ),
            ),
          ],
        );
      },
    );
  }
}
