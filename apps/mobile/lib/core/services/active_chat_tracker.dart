/// Tracks which trip's message thread the user currently has open on
/// screen, so a "new message" push notification for that same trip can be
/// suppressed -- an already-open MessageThreadScreen shows the message live
/// via its own WebSocket connection, so popping up a redundant system
/// notification for it would be noisy rather than useful.
///
/// Set by MessageThreadScreen in initState/dispose. Deliberately a bare
/// static field rather than a BLoC/ChangeNotifier -- there is nothing to
/// subscribe to, this is a one-shot read at the moment a push arrives.
class ActiveChatTracker {
  static String? openTripId;
}
