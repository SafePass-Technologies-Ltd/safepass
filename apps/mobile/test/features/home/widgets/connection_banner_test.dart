/// Widget tests for the degraded-connection banner (C-002 r2).
///
/// The banner must read as a transient connection problem, never as a
/// session failure: the user stays signed in while the API is unreachable.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:safepass_mobile/app/theme.dart';
import 'package:safepass_mobile/features/home/widgets/connection_banner.dart';

void main() {
  testWidgets('shows the transient connection notice', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ConnectionDegradedBanner(),
        ),
      ),
    );

    expect(find.text('Connection trouble'), findsOneWidget);
    expect(
      find.textContaining('your details are safe'),
      findsOneWidget,
      reason: 'the copy must reassure the user that the session is intact',
    );
    expect(find.byIcon(Icons.cloud_off), findsOneWidget);
  });

  testWidgets('uses the theme warning palette, not hardcoded colors',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.lightTheme,
        home: const Scaffold(
          body: ConnectionDegradedBanner(),
        ),
      ),
    );

    final container = tester.widget<Container>(
      find
          .descendant(
            of: find.byType(ConnectionDegradedBanner),
            matching: find.byType(Container),
          )
          .first,
    );
    expect(container.color, AppColors.warning100);
  });
}
