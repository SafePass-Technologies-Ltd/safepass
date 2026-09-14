/// SafePass Mobile App — Brand Colors & Theme
///
/// See docs/SafePass/branding.md for the full brand identity guide.
///
/// Token strategy: `AppColors` carries the semantic names the spec uses
/// (structural roles, semantic scales, brand surfaces) in a single column of
/// constants; `AppTheme` maps them onto Material 3 widgets. Dark mode is
/// declared in the spec (every token row has a Light and a Dark value) but is
/// NOT yet implemented — only the light column is materialized below.
library safepass_theme;

import 'package:flutter/material.dart';

/// Brand color palette. Light-column values only; the spec's dark column
/// values are intentionally not included until dark mode is implemented.
class AppColors {
  AppColors._();

  // ── Primary scale light column (docs/SafePass/branding.md, Electric Blue) ──
  /// primary-500 — Electric Blue: buttons, links, focus rings
  static const Color primary = Color(0xFF0EA5E9);
  static const Color primary900 = Color(0xFF0C4A6E);
  static const Color primary800 = Color(0xFF075985);
  static const Color primary700 = Color(0xFF0369A1);
  static const Color primary600 = Color(0xFF0284C7);
  static const Color primary400 = Color(0xFF38BDF8);
  static const Color primary300 = Color(0xFF7DD3FC);
  static const Color primary200 = Color(0xFFBAE6FD);
  static const Color primary100 = Color(0xFFE0F2FE);

  /// primary-500 alias kept for existing call sites: verified markers,
  /// safe status, success states.
  static const Color safetyGreen = Color(0xFF0D904F);

  /// warning-500 alias kept for existing call sites: warnings, delayed
  /// status, unverified markers.
  static const Color alertAmber = Color(0xFFF5A623);

  /// error-500 alias kept for existing call sites: panic button, emergency
  /// status, destructive.
  static const Color emergencyRed = Color(0xFFD93025);

  /// grey-900 — primary text, dark emphasis
  static const Color darkSlate = Color(0xFF1E293B);

  /// grey-50 — page background
  static const Color lightGrey = Color(0xFFF8FAFC);

  /// White — cards, modals, text on dark
  static const Color white = Color(0xFFFFFFFF);

  // ── Structural role tokens (spec: surface, text, border) ──
  /// surface — page background (grey-50)
  static const Color surface = Color(0xFFF8FAFC);

  /// surface-secondary — section & card alternation (grey-200)
  static const Color surfaceSecondary = Color(0xFFF1F5F9);

  /// text-primary — headings and body copy (grey-900)
  static const Color textPrimary = Color(0xFF1E293B);

  /// text-secondary — supporting copy, captions (grey-600)
  static const Color textSecondary = Color(0xFF64748B);

  /// border — dividers, card & input borders (grey-300)
  static const Color border = Color(0xFFE2E8F0);

  // ── Neutral grey scale light column (grey-100..grey-800) ──
  static const Color grey100 = Color(0xFFF1F5F9);
  static const Color grey200 = Color(0xFFF1F5F9);
  static const Color grey300 = Color(0xFFE2E8F0);
  static const Color grey400 = Color(0xFFCBD5E1);
  static const Color grey500 = Color(0xFF94A3B8);
  static const Color grey600 = Color(0xFF64748B);
  static const Color grey700 = Color(0xFF475569);
  static const Color grey800 = Color(0xFF334155);

  // ── Semantic scales, light column (100/300/500/700/900) ──

  /// success — verified markers, safe status, success
  static const Color success100 = Color(0xFFE6F7EE);
  static const Color success300 = Color(0xFF7CCBA3);
  static const Color success500 = Color(0xFF0D904F);
  static const Color success700 = Color(0xFF0A7340);
  static const Color success900 = Color(0xFF075A32);

  /// warning — warnings, delayed status, unverified markers
  static const Color warning100 = Color(0xFFFEF3E0);
  static const Color warning300 = Color(0xFFF9D193);
  static const Color warning500 = Color(0xFFF5A623);
  static const Color warning700 = Color(0xFFC47F14);
  static const Color warning900 = Color(0xFF8F5D0E);

  /// error — panic button, emergency status, destructive
  static const Color error100 = Color(0xFFFBE9E8);
  static const Color error300 = Color(0xFFEE9B94);
  static const Color error500 = Color(0xFFD93025);
  static const Color error700 = Color(0xFFB0261D);
  static const Color error900 = Color(0xFF8C1D16);

  /// info — informational alerts
  static const Color info100 = Color(0xFFE0F2FE);
  static const Color info300 = Color(0xFF7DD3FC);
  static const Color info500 = Color(0xFF0284C7);
  static const Color info700 = Color(0xFF0369A1);
  static const Color info900 = Color(0xFF075985);

  /// accent — graph lines, location pin, highlights
  static const Color accent100 = Color(0xFFFFE4E6);
  static const Color accent300 = Color(0xFFFDA4AF);
  static const Color accent500 = Color(0xFFE11D48);
  static const Color accent700 = Color(0xFFBE123C);
  static const Color accent900 = Color(0xFF881337);
}

/// Application-wide theme configuration.
class AppTheme {
  AppTheme._();

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorSchemeSeed: AppColors.primary,
      scaffoldBackgroundColor: AppColors.lightGrey,
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.white,
        elevation: 0,
        centerTitle: true,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.white,
          minimumSize: const Size(double.infinity, 52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: AppColors.border),
        ),
        color: AppColors.white,
      ),
    );
  }
}
