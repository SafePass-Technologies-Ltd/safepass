/// SafePass Mobile App — Brand Colors & Theme
///
/// See docs/SafePass/branding.md for the full brand identity guide.
library safepass_theme;

import 'package:flutter/material.dart';

/// Brand color palette.
class AppColors {
  AppColors._();

  /// Electric Blue — Primary buttons, headers, brand mark, active links
  static const Color primary = Color(0xFF0EA5E9);

  /// Safety Green — Safe status, confirmed markers, success states
  static const Color safetyGreen = Color(0xFF0D904F);

  /// Alert Amber — Warnings, delayed status, unverified markers
  static const Color alertAmber = Color(0xFFF5A623);

  /// Emergency Red — Panic button, emergency status, critical alerts
  static const Color emergencyRed = Color(0xFFD93025);

  /// Dark Slate — Text, navigation, dark mode background
  static const Color darkSlate = Color(0xFF1E293B);

  /// Light Grey — Backgrounds, cards, light surfaces
  static const Color lightGrey = Color(0xFFF8FAFC);

  /// White — Cards, modals, text on dark
  static const Color white = Color(0xFFFFFFFF);
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
          borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
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
          side: const BorderSide(color: Color(0xFFE2E8F0)),
        ),
        color: AppColors.white,
      ),
    );
  }
}
