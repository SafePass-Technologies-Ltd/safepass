library login_screen;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme.dart';
import '../../../app/router.dart';
import '../cubit/auth_cubit.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Full-screen gradient background
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0xFF0F172A),
                  Color(0xFF0C2340),
                  Color(0xFF0EA5E9),
                ],
                stops: [0.0, 0.6, 1.0],
              ),
            ),
          ),

          // Subtle grid overlay
          Opacity(
            opacity: 0.04,
            child: CustomPaint(
              painter: _GridPainter(),
              size: Size.infinite,
            ),
          ),

          SafeArea(
            child: Column(
              children: [
                // Hero section — expands to fill space
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // SafePass logo
                        ClipRRect(
                          borderRadius: BorderRadius.circular(16),
                          child: Image.asset(
                            'assets/images/safepass-logo.png',
                            width: 100,
                            height: 100,
                            fit: BoxFit.contain,
                          ),
                        ),
                        const SizedBox(height: 24),
                        const Text(
                          'SafePass',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 40,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -1,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Every Journey Matters.',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.7),
                            fontSize: 20,
                            fontWeight: FontWeight.w400,
                            height: 1.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // Bottom auth sheet
                Container(
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
                  ),
                  padding: const EdgeInsets.fromLTRB(24, 28, 24, 16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Sign in to continue',
                        style: TextStyle(
                          color: AppColors.darkSlate,
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Choose your preferred sign-in method',
                        style: TextStyle(
                          color: AppColors.darkSlate.withValues(alpha: 0.5),
                          fontSize: 13,
                        ),
                      ),

                      // Error banner
                      BlocBuilder<AuthCubit, AuthState>(
                        builder: (context, state) {
                          if (state.status != AuthStatus.error) return const SizedBox(height: 20);
                          return Padding(
                            padding: const EdgeInsets.only(top: 16),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              decoration: BoxDecoration(
                                color: AppColors.emergencyRed.withValues(alpha: 0.08),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: AppColors.emergencyRed.withValues(alpha: 0.25),
                                ),
                              ),
                              child: Row(
                                children: [
                                  Icon(Icons.error_outline, color: AppColors.emergencyRed, size: 16),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      state.errorMessage ?? 'Authentication failed',
                                      style: TextStyle(
                                        color: AppColors.emergencyRed,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),

                      const SizedBox(height: 20),

                      // Phone — primary CTA
                      _AuthButton(
                        label: 'Continue with Phone',
                        icon: Icons.phone_android_rounded,
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        onPressed: () => context.go(AppRoutes.phoneAuth),
                      ),
                      const SizedBox(height: 12),

                      // Google
                      _AuthButton(
                        label: 'Continue with Google',
                        icon: Icons.g_mobiledata_rounded,
                        backgroundColor: const Color(0xFFF8FAFC),
                        foregroundColor: AppColors.darkSlate,
                        borderColor: const Color(0xFFE2E8F0),
                        onPressed: () => context.read<AuthCubit>().signInWithGoogle(),
                      ),
                      const SizedBox(height: 10),

                      // Facebook + Apple side by side
                      Row(
                        children: [
                          Expanded(
                            child: _AuthButton(
                              label: 'Facebook',
                              icon: Icons.facebook_rounded,
                              backgroundColor: const Color(0xFF1877F2),
                              foregroundColor: Colors.white,
                              compact: true,
                              onPressed: () => context.read<AuthCubit>().signInWithFacebook(),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _AuthButton(
                              label: 'Apple',
                              icon: Icons.apple_rounded,
                              backgroundColor: Colors.black,
                              foregroundColor: Colors.white,
                              compact: true,
                              onPressed: () => context.read<AuthCubit>().signInWithApple(),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 20),

                      Text(
                        'By continuing you agree to our Terms of Service and\nconsent to emergency audio recording.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: AppColors.darkSlate.withValues(alpha: 0.4),
                          fontSize: 11,
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 8),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AuthButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color backgroundColor;
  final Color foregroundColor;
  final Color? borderColor;
  final bool compact;
  final VoidCallback onPressed;

  const _AuthButton({
    required this.label,
    required this.icon,
    required this.backgroundColor,
    required this.foregroundColor,
    this.borderColor,
    this.compact = false,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final isLoading = context.watch<AuthCubit>().state.status == AuthStatus.loading;

    return SizedBox(
      height: compact ? 46 : 52,
      child: ElevatedButton.icon(
        onPressed: isLoading ? null : onPressed,
        icon: isLoading
            ? SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: foregroundColor,
                ),
              )
            : Icon(icon, size: compact ? 18 : 20),
        label: Text(
          label,
          style: TextStyle(
            fontSize: compact ? 13 : 15,
            fontWeight: FontWeight.w600,
          ),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: backgroundColor,
          foregroundColor: foregroundColor,
          elevation: 0,
          side: borderColor != null ? BorderSide(color: borderColor!) : BorderSide.none,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }
}

// Subtle dot-grid background painter
class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    const spacing = 28.0;
    final paint = Paint()
      ..color = Colors.white
      ..strokeWidth = 1.5
      ..style = PaintingStyle.fill;

    for (double x = 0; x < size.width; x += spacing) {
      for (double y = 0; y < size.height; y += spacing) {
        canvas.drawCircle(Offset(x, y), 1, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
