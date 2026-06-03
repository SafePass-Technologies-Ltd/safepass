/// Login Screen — Social auth buttons + phone auth.
///
/// Auth-based navigation (login → home, sign-out → login) is handled
/// by the GoRouter `redirect` guard — this screen only renders the UI.
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
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const SizedBox(height: 48),

              // Logo
              ClipRRect(
                borderRadius: BorderRadiusGeometry.circular(12),
                child: Image.asset(
                  'assets/images/safepass-logo.png',
                  width: 120,
                ),
              ),
              const SizedBox(height: 32),

              // Tagline
              Text(
                'SafePass',
                style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppColors.darkSlate,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                'Your Journey, Monitored.',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: AppColors.darkSlate.withValues(alpha: 0.7),
                    ),
              ),
              const SizedBox(height: 32),

              // Error banner (shown when auth fails)
              BlocBuilder<AuthCubit, AuthState>(
                builder: (context, state) {
                  if (state.status != AuthStatus.error) {
                    return const SizedBox.shrink();
                  }
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.emergencyRed.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: AppColors.emergencyRed.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Text(
                        state.errorMessage ?? 'Authentication failed',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: AppColors.emergencyRed,
                            ),
                      ),
                    ),
                  );
                },
              ),

              // Google Sign-In
              _SocialAuthButton(
                label: 'Continue with Google',
                backgroundColor: Colors.white,
                foregroundColor: AppColors.darkSlate,
                borderColor: const Color(0xFFE2E8F0),
                onPressed: () =>
                    context.read<AuthCubit>().signInWithGoogle(),
              ),
              const SizedBox(height: 12),

              // Facebook Sign-In
              _SocialAuthButton(
                label: 'Continue with Facebook',
                backgroundColor: const Color(0xFF1877F2),
                foregroundColor: Colors.white,
                onPressed: () =>
                    context.read<AuthCubit>().signInWithFacebook(),
              ),
              const SizedBox(height: 12),

              // Apple Sign-In
              _SocialAuthButton(
                label: 'Continue with Apple',
                backgroundColor: Colors.black,
                foregroundColor: Colors.white,
                onPressed: () =>
                    context.read<AuthCubit>().signInWithApple(),
              ),
              const SizedBox(height: 12),

              // Phone Sign-In
              _SocialAuthButton(
                label: 'Continue with Phone',
                backgroundColor: AppColors.safetyGreen,
                foregroundColor: Colors.white,
                icon: Icons.phone_android,
                onPressed: () =>
                    context.go(AppRoutes.phoneAuth),
              ),

              const SizedBox(height: 24),

              // Terms of Service
              Text(
                'By continuing, you agree to our Terms of Service\n'
                'and consent to emergency audio recording.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppColors.darkSlate.withValues(alpha: 0.5),
                    ),
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}

/// Reusable social auth button with loading state from AuthCubit.
class _SocialAuthButton extends StatelessWidget {
  final String label;
  final Color backgroundColor;
  final Color foregroundColor;
  final Color? borderColor;
  final VoidCallback onPressed;
  final IconData? icon;

  const _SocialAuthButton({
    required this.label,
    required this.backgroundColor,
    required this.foregroundColor,
    this.borderColor,
    required this.onPressed,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final isLoading =
        context.watch<AuthCubit>().state.status == AuthStatus.loading;

    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton.icon(
        onPressed: isLoading ? null : onPressed,
        icon: isLoading
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Icon(icon ?? Icons.login, size: 20),
        label: Text(label),
        style: ElevatedButton.styleFrom(
          backgroundColor: backgroundColor,
          foregroundColor: foregroundColor,
          side: borderColor != null ? BorderSide(color: borderColor!) : null,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }
}
