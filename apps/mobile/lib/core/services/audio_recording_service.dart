/// Silent background audio recording for emergency sessions.
///
/// Records in short chunks for the duration of an active emergency (panic
/// button press to check-in/resolution) -- see emergency_cubit.dart's
/// periodic chunk-rotation loop, which calls stop() then start() again
/// every _chunkInterval to produce a new self-contained file each time,
/// uploading each one independently as it's captured. This means evidence
/// reaches the server progressively throughout the emergency, not only if/
/// when the user manages to check in -- important since the scenario this
/// feature most needs to survive (user incapacitated, phone taken, etc.) is
/// exactly the one where a single "upload once at the end" design would
/// lose everything. Uses a low-bitrate AAC/M4A encoding to keep each
/// chunk's file size small for upload over potentially poor network
/// conditions during an emergency.
///
/// This class itself is deliberately dumb -- one recording session at a
/// time, start()/stop() only. All chunking/upload/retry orchestration lives
/// in EmergencyCubit, which is also responsible for calling stop() (not
/// just dispose()) before tearing this down, so the AAC/M4A container's
/// index atom gets written -- disposing while still recording produces an
/// unplayable file.
library safepass_audio_recording_service;

import 'package:flutter/foundation.dart' show debugPrint;
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

  /// True once [start] has failed at least once (permission denied, or the
  /// native recorder threw) for the app's current lifetime. Purely a
  /// diagnostic signal for EmergencyCubit/UI to surface -- an emergency
  /// session that produced zero audio should be distinguishable from "audio
  /// recorded fine, nothing has uploaded yet" rather than looking identical.
  bool lastStartFailed = false;

  /// Requests microphone permission (if not already granted) and starts
  /// recording to a local file. Returns false (without throwing) if
  /// permission is denied or the native recorder fails to start, since this
  /// must never block the panic flow -- but unlike before, this is no
  /// longer a silent failure: it's logged, and [lastStartFailed] lets
  /// callers surface it. A previous version of this method swallowed both
  /// failure modes with zero signal anywhere, which made "panic triggered,
  /// zero audio ever uploaded" completely undebuggable in the field --
  /// exactly this happened during testing, traced back to a denied/never-
  /// granted microphone permission with no error, log, or UI indication
  /// anywhere that recording had silently never started.
  Future<bool> start() async {
    if (isRecording) return true;

    try {
      // record's hasPermission() requests the OS permission prompt by
      // default (request: true) if not already decided -- if the user taps
      // Deny (or it was previously permanently denied, e.g. Android's
      // "Don't ask again"), this returns false and nothing more happens
      // natively; there is no separate exception to catch for that case.
      final hasPermission = await _recorder.hasPermission();
      if (!hasPermission) {
        lastStartFailed = true;
        debugPrint(
          '[AudioRecordingService] Microphone permission denied -- emergency '
          'audio will NOT be recorded for this session. Check device '
          'Settings > Apps > SafePass > Permissions > Microphone.',
        );
        return false;
      }

      final dir = await getTemporaryDirectory();
      final path =
          '${dir.path}/emergency_audio_${DateTime.now().millisecondsSinceEpoch}.m4a';

      await _recorder.start(_config, path: path);
      _currentFilePath = path;
      lastStartFailed = false;
      return true;
    } catch (e) {
      // Covers native recorder failures beyond permission (mic held by
      // another app, hardware/codec issue, etc.) -- previously unhandled
      // here entirely, which on an unawaited call site becomes a silent
      // unhandled Future rejection with no visible trace.
      lastStartFailed = true;
      debugPrint('[AudioRecordingService] Failed to start recording: $e');
      return false;
    }
  }

  /// Stops the current recording and returns the local file path, or
  /// null if no recording was in progress (e.g. permission was denied, or
  /// [start] otherwise failed -- see [lastStartFailed]).
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
