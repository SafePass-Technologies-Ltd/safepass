/// Silent background audio recording for emergency sessions.
///
/// Records a single audio file for the duration of an active emergency
/// (panic button press to check-in/resolution). Uses a low-bitrate AAC/M4A
/// encoding to keep file size small for upload over potentially poor
/// network conditions during an emergency.
library safepass_audio_recording_service;

import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// Wraps the `record` package to provide a simple start/stop API for
/// emergency audio capture. One instance is expected to handle one
/// recording session at a time (one per active emergency).
class AudioRecordingService {
  final AudioRecorder _recorder = AudioRecorder();

  /// Config tuned for small file size: mono, 16kHz, low bitrate AAC.
  /// Speech-focused recordings don't need high fidelity, and emergency
  /// uploads must succeed quickly over cellular data.
  static const _config = RecordConfig(
    encoder: AudioEncoder.aacLc,
    bitRate: 32000,
    sampleRate: 16000,
    numChannels: 1,
  );

  String? _currentFilePath;

  /// Whether a recording session is currently in progress.
  bool get isRecording => _currentFilePath != null;

  /// Requests microphone permission (if not already granted) and starts
  /// recording to a local file. Returns silently without recording if
  /// permission is denied, since this must never block the panic flow.
  Future<void> start() async {
    if (isRecording) return;

    final hasPermission = await _recorder.hasPermission();
    if (!hasPermission) return;

    final dir = await getTemporaryDirectory();
    final path =
        '${dir.path}/emergency_audio_${DateTime.now().millisecondsSinceEpoch}.m4a';

    await _recorder.start(_config, path: path);
    _currentFilePath = path;
  }

  /// Stops the current recording and returns the local file path, or
  /// null if no recording was in progress (e.g. permission was denied).
  Future<String?> stop() async {
    if (!isRecording) return null;

    final path = await _recorder.stop();
    _currentFilePath = null;
    return path;
  }

  /// Releases recorder resources. Call when the cubit/screen is disposed.
  Future<void> dispose() async {
    await _recorder.dispose();
  }
}
