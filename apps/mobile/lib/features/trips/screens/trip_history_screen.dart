import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../app/theme.dart';
import '../../../core/constants.dart' show kApiBaseUrl;

class TripHistoryScreen extends StatefulWidget {
  const TripHistoryScreen({super.key});

  @override
  State<TripHistoryScreen> createState() => _TripHistoryScreenState();
}

class _TripHistoryScreenState extends State<TripHistoryScreen> {
  List<_TripRow> _trips = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetchTrips();
  }

  Future<void> _fetchTrips() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      const storage = FlutterSecureStorage();
      final token = await storage.read(key: 'access_token');
      final dio = Dio();
      final response = await dio.get(
        '$kApiBaseUrl/v1/trips',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
      final List<dynamic> raw = (response.data as Map)['trips'] as List? ?? [];
      setState(() {
        _trips = raw.map(_TripRow.fromJson).toList();
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load journeys. Please try again.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Journey History'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetchTrips,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppColors.emergencyRed),
              const SizedBox(height: 12),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _fetchTrips, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }
    if (_trips.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.route, size: 64, color: AppColors.darkSlate.withValues(alpha: 0.2)),
            const SizedBox(height: 12),
            const Text('No journeys yet', style: TextStyle(fontSize: 16, color: Colors.grey)),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _fetchTrips,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _trips.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, index) => _TripCard(trip: _trips[index]),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────
// Data model
// ────────────────────────────────────────────────────────────

class _TripRow {
  final String id;
  final String originName;
  final String destinationName;
  final String status;
  final DateTime? createdAt;
  final double? cost;

  const _TripRow({
    required this.id,
    required this.originName,
    required this.destinationName,
    required this.status,
    this.createdAt,
    this.cost,
  });

  factory _TripRow.fromJson(dynamic json) {
    final map = json as Map<String, dynamic>;
    final origin = map['origin'] as Map<String, dynamic>? ?? {};
    final dest = map['destination'] as Map<String, dynamic>? ?? {};
    return _TripRow(
      id: map['id'] as String? ?? '',
      originName: origin['name'] as String? ?? 'Unknown origin',
      destinationName: dest['name'] as String? ?? 'Unknown destination',
      status: map['status'] as String? ?? 'unknown',
      createdAt: map['createdAt'] != null
          ? DateTime.tryParse(map['createdAt'] as String)
          : null,
      cost: (map['cost'] as num?)?.toDouble(),
    );
  }
}

// ────────────────────────────────────────────────────────────
// Trip card widget
// ────────────────────────────────────────────────────────────

class _TripCard extends StatelessWidget {
  final _TripRow trip;

  const _TripCard({required this.trip});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        trip.originName,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                          color: AppColors.darkSlate,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          const Icon(Icons.arrow_downward, size: 12, color: Colors.grey),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              trip.destinationName,
                              style: const TextStyle(fontSize: 13, color: Colors.grey),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                _StatusBadge(status: trip.status),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.calendar_today, size: 13, color: Colors.grey),
                const SizedBox(width: 4),
                Text(
                  trip.createdAt != null
                      ? _formatDate(trip.createdAt!)
                      : '—',
                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                ),
                const Spacer(),
                if (trip.cost != null)
                  Text(
                    '₦${trip.cost!.toStringAsFixed(2)}',
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                      color: AppColors.primary,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime dt) {
    return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}  '
        '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;

  const _StatusBadge({required this.status});

  Color get _bg => switch (status) {
        'active' => const Color(0xFFDCFCE7),
        'completed' => const Color(0xFFDBEAFE),
        'cancelled' => const Color(0xFFFEE2E2),
        'emergency' || 'escalated' => const Color(0xFFFEE2E2),
        'delayed' => const Color(0xFFFEF3C7),
        _ => const Color(0xFFF1F5F9),
      };

  Color get _fg => switch (status) {
        'active' => AppColors.safetyGreen,
        'completed' => const Color(0xFF1D4ED8),
        'cancelled' => AppColors.emergencyRed,
        'emergency' || 'escalated' => AppColors.emergencyRed,
        'delayed' => AppColors.alertAmber,
        _ => AppColors.darkSlate,
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: _bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        status[0].toUpperCase() + status.substring(1),
        style: TextStyle(
          color: _fg,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
