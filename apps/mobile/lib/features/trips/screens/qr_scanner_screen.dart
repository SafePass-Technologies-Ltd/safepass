import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../app/theme.dart';
import '../../../core/constants.dart' show kApiBaseUrl;

class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({super.key});

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen> {
  final MobileScannerController _controller = MobileScannerController();
  bool _processing = false;
  _VehicleInfo? _result;
  String? _scanError;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_processing || _result != null) return;
    final barcode = capture.barcodes.firstOrNull;
    final raw = barcode?.rawValue;
    if (raw == null || raw.isEmpty) return;

    // Extract vehicle ID from the scanned value — supports both plain IDs
    // and deep-link URLs of the form .../vehicles/<id>.
    final vehicleId = raw.contains('/') ? raw.split('/').last : raw;

    setState(() {
      _processing = true;
      _scanError = null;
    });

    try {
      const storage = FlutterSecureStorage();
      final token = await storage.read(key: 'access_token');
      final dio = Dio();
      final response = await dio.get(
        '$kApiBaseUrl/v1/vehicles/$vehicleId',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
      final data = response.data as Map<String, dynamic>;
      setState(() {
        _result = _VehicleInfo.fromJson(data);
        _processing = false;
      });
      await _controller.stop();
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      setState(() {
        _scanError = code == 404
            ? 'Vehicle not found. The QR code may be invalid.'
            : 'Failed to verify vehicle. Please try again.';
        _processing = false;
      });
    }
  }

  void _reset() {
    setState(() {
      _result = null;
      _scanError = null;
      _processing = false;
    });
    _controller.start();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan Vehicle QR'),
        actions: [
          if (_result == null)
            IconButton(
              icon: const Icon(Icons.flash_on),
              onPressed: () => _controller.toggleTorch(),
              tooltip: 'Toggle torch',
            ),
        ],
      ),
      body: _result != null
          ? _VehicleResultView(info: _result!, onScanAgain: _reset)
          : Stack(
              children: [
                MobileScanner(
                  controller: _controller,
                  onDetect: _onDetect,
                ),
                // Viewfinder overlay
                Center(
                  child: Container(
                    width: 240,
                    height: 240,
                    decoration: BoxDecoration(
                      border: Border.all(color: AppColors.primary, width: 3),
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
                // Status messages
                Positioned(
                  bottom: 80,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: _processing
                        ? const CircularProgressIndicator(color: Colors.white)
                        : _scanError != null
                            ? _ErrorChip(message: _scanError!, onDismiss: _reset)
                            : const _HintChip(text: 'Point camera at vehicle QR code'),
                  ),
                ),
              ],
            ),
    );
  }
}

// ────────────────────────────────────────────────────────────
// Data model
// ────────────────────────────────────────────────────────────

class _VehicleInfo {
  final String id;
  final String plateNumber;
  final String? make;
  final String? model;
  final String? vehicleType;
  final bool isActive;

  const _VehicleInfo({
    required this.id,
    required this.plateNumber,
    this.make,
    this.model,
    this.vehicleType,
    required this.isActive,
  });

  factory _VehicleInfo.fromJson(Map<String, dynamic> json) {
    final v = json['vehicle'] as Map<String, dynamic>? ?? json;
    return _VehicleInfo(
      id: v['id'] as String? ?? '',
      plateNumber: v['plateNumber'] as String? ?? '—',
      make: v['make'] as String?,
      model: v['model'] as String?,
      vehicleType: v['vehicleType'] as String?,
      isActive: v['isActive'] as bool? ?? true,
    );
  }

  String get displayName {
    final parts = [make, model].where((s) => s != null && s.isNotEmpty).join(' ');
    return parts.isNotEmpty ? parts : 'Unknown vehicle';
  }
}

// ────────────────────────────────────────────────────────────
// Result view
// ────────────────────────────────────────────────────────────

class _VehicleResultView extends StatelessWidget {
  final _VehicleInfo info;
  final VoidCallback onScanAgain;

  const _VehicleResultView({required this.info, required this.onScanAgain});

  @override
  Widget build(BuildContext context) {
    final verified = info.isActive;
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            verified ? Icons.verified : Icons.cancel,
            size: 72,
            color: verified ? AppColors.safetyGreen : AppColors.emergencyRed,
          ),
          const SizedBox(height: 16),
          Text(
            verified ? 'Vehicle Verified' : 'Vehicle Inactive',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: verified ? AppColors.safetyGreen : AppColors.emergencyRed,
            ),
          ),
          const SizedBox(height: 24),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  _InfoRow(label: 'Plate Number', value: info.plateNumber),
                  _InfoRow(label: 'Vehicle', value: info.displayName),
                  if (info.vehicleType != null)
                    _InfoRow(label: 'Type', value: info.vehicleType!),
                  _InfoRow(label: 'Status', value: verified ? 'Active' : 'Inactive'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: onScanAgain,
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Scan Again'),
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.grey, fontSize: 13)),
          Text(
            value,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 13,
              color: AppColors.darkSlate,
            ),
          ),
        ],
      ),
    );
  }
}

class _HintChip extends StatelessWidget {
  final String text;

  const _HintChip({required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black54,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 13)),
    );
  }
}

class _ErrorChip extends StatelessWidget {
  final String message;
  final VoidCallback onDismiss;

  const _ErrorChip({required this.message, required this.onDismiss});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onDismiss,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 32),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.emergencyRed,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          message,
          style: const TextStyle(color: Colors.white, fontSize: 13),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}
