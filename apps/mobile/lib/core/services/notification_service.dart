import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Singleton wrapper around [FlutterLocalNotificationsPlugin] scoped to
/// SafePass emergency alerts. Call [init] once at app startup before [runApp],
/// then call [showEmergencyNotification] wherever an emergency fires.
class NotificationService {
  NotificationService._internal();

  static final NotificationService instance = NotificationService._internal();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  /// Called when the user taps a notification shown by this service (e.g.
  /// the "new message"/"check-in" one from [showMessageNotification]) while
  /// the app is already running -- either in the foreground (Android/iOS
  /// deliver the tap directly) or backgrounded. Set by main.dart to push the
  /// trip's message thread route; the payload passed here is the tripId
  /// given to [showMessageNotification].
  ///
  /// NOTE: this does NOT cover the case where the app is fully terminated
  /// and relaunched by tapping one of these local notifications -- unlike
  /// FCM's own system notifications (handled via
  /// FirebaseMessaging.getInitialMessage in auth_cubit.dart), a locally
  /// shown notification has no "initial notification" API to recover the
  /// payload after a cold start. In practice this only matters if the app
  /// was killed AND the user had previously received a foreground push (the
  /// only case that shows a local notification) AND never opened it before
  /// killing the app themselves -- an edge case, not the common path.
  void Function(String tripId)? onNotificationTap;

  /// Initialises the plugin for Android and iOS.
  ///
  /// On Android the notification channels are registered here so that
  /// [showEmergencyNotification]/[showMessageNotification] can reference
  /// them by id without any further setup. On iOS the method requests
  /// alert, sound, and badge permissions from the user at first launch.
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
    await _plugin.initialize(
      settings: settings,
      // Fires when the user taps a notification while the app process is
      // alive (foreground or backgrounded) -- payload is whatever string
      // was passed to show()'s `payload` argument.
      onDidReceiveNotificationResponse: (response) {
        final tripId = response.payload;
        if (tripId != null && tripId.isNotEmpty) {
          onNotificationTap?.call(tripId);
        }
      },
    );

    // Create the high-importance channel required on Android 8+. Calling this
    // on lower API levels is a no-op, so no version guard is needed.
    const emergencyChannel = AndroidNotificationChannel(
      'safepass_emergency',
      'Emergency Alerts',
      importance: Importance.max,
      playSound: true,
    );

    // Separate, lower-importance channel for chat messages/check-ins --
    // these shouldn't compete with the emergency channel's max-importance,
    // always-heads-up, siren-like presentation. Users can also mute this
    // channel independently via Android's per-channel notification settings
    // without silencing emergency alerts.
    const messageChannel = AndroidNotificationChannel(
      'safepass_messages',
      'Trip Messages',
      description: 'New messages and check-ins from your monitoring officer during an active trip.',
      importance: Importance.high,
      playSound: true,
    );

    final androidPlugin = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(emergencyChannel);
    await androidPlugin?.createNotificationChannel(messageChannel);
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

  /// Shows an in-app heads-up notification for a new chat message or
  /// check-in received while the app is in the foreground -- FCM does NOT
  /// automatically surface a system notification for foreground pushes, so
  /// without this call the user would see nothing at all until they
  /// happened to reopen the chat screen themselves.
  ///
  /// [tripId] is passed as the notification's payload so a tap can navigate
  /// straight to that trip's message thread (see [onNotificationTap] and
  /// main.dart's wiring of it).
  ///
  /// Uses a fixed notification id=2 (distinct from the emergency
  /// notification's id=1) so a second incoming message replaces the first
  /// rather than stacking -- consistent with the app's one-active-trip-at-a-
  /// time design, there is only ever one trip's conversation to surface.
  Future<void> showMessageNotification({
    required String tripId,
    required String title,
    required String body,
  }) async {
    const androidDetails = AndroidNotificationDetails(
      'safepass_messages',
      'Trip Messages',
      importance: Importance.high,
      priority: Priority.high,
      playSound: true,
    );

    const details = NotificationDetails(
      android: androidDetails,
      iOS: DarwinNotificationDetails(presentSound: true),
    );

    await _plugin.show(
      id: 2,
      title: title,
      body: body,
      notificationDetails: details,
      payload: tripId,
    );
  }
}
