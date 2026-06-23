import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Singleton wrapper around [FlutterLocalNotificationsPlugin] scoped to
/// SafePass emergency alerts. Call [init] once at app startup before [runApp],
/// then call [showEmergencyNotification] wherever an emergency fires.
class NotificationService {
  NotificationService._internal();

  static final NotificationService instance = NotificationService._internal();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  /// Initialises the plugin for Android and iOS.
  ///
  /// On Android the notification channel is registered here so that
  /// [showEmergencyNotification] can reference it by id without any further
  /// setup. On iOS the method requests alert, sound, and badge permissions
  /// from the user at first launch.
  Future<void> init() async {
    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');

    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestSoundPermission: true,
      requestBadgePermission: true,
    );

    const settings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    // v22+ switched initialize() to named parameters.
    await _plugin.initialize(settings: settings);

    // Create the high-importance channel required on Android 8+. Calling this
    // on lower API levels is a no-op, so no version guard is needed.
    const channel = AndroidNotificationChannel(
      'safepass_emergency',
      'Emergency Alerts',
      importance: Importance.max,
      playSound: true,
    );

    await _plugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);
  }

  /// Shows the emergency system notification immediately.
  ///
  /// Uses notification id=1 so a second call replaces the first rather than
  /// stacking a duplicate — only one emergency notification is ever visible
  /// at a time.
  Future<void> showEmergencyNotification() async {
    const androidDetails = AndroidNotificationDetails(
      'safepass_emergency',
      'Emergency Alerts',
      importance: Importance.max,
      priority: Priority.high,
      playSound: true,
    );

    const details = NotificationDetails(
      android: androidDetails,
      iOS: DarwinNotificationDetails(presentSound: true),
    );

    // v22+ switched show() to named parameters.
    await _plugin.show(
      id: 1,
      title: 'Emergency triggered',
      body: 'SafePass has alerted your emergency contacts.',
      notificationDetails: details,
    );
  }
}
