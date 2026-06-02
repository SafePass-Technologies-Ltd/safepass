/// Login Screen — Social auth buttons + temporary email/password form.
///
/// Email/password auth is a temporary fallback while Google Sign-In
/// configuration is being resolved. It will be removed once social auth
/// (Google, Apple, Facebook) is fully operational.
library login_screen;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme.dart';
import '../../../app/router.dart';
import '../cubit/auth_cubit.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isSignUpMode = false;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;

    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (_isSignUpMode) {
      context.read<AuthCubit>().signUpWithEmailAndPassword(
        email: email,
        password: password,
      );
    } else {
      context.read<AuthCubit>().signInWithEmailAndPassword(
        email: email,
        password: password,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<AuthCubit, AuthState>(
      listener: (context, state) {
        if (state.status == AuthStatus.authenticated) {
          context.go(AppRoutes.home);
        } else if (state.status == AuthStatus.onboardingRequired) {
          context.go(AppRoutes.onboarding);
        } else if (state.status == AuthStatus.error) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(state.errorMessage ?? 'Authentication failed'),
              backgroundColor: AppColors.emergencyRed,
            ),
          );
        }
      },
      child: Scaffold(
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const SizedBox(height: 48),

                // Logo area
                // Container(
                //   width: 120,
                //   height: 120,
                //   decoration: BoxDecoration(
                //     color: AppColors.primary.withValues(alpha: 0.1),
                //     shape: BoxShape.circle,
                //   ),
                //   child: const Icon(
                //     Icons.shield_outlined,
                //     size: 64,
                //     color: AppColors.primary,
                //   ),
                // ),
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

                // ---------- Social Auth Buttons ----------
                _SocialAuthButton(
                  icon: 'assets/icons/google_icon.svg',
                  label: 'Continue with Google',
                  backgroundColor: Colors.white,
                  foregroundColor: AppColors.darkSlate,
                  borderColor: const Color(0xFFE2E8F0),
                  onPressed: () => context.read<AuthCubit>().signInWithGoogle(),
                ),
                const SizedBox(height: 12),
                _SocialAuthButton(
                  icon: 'assets/icons/facebook_icon.svg',
                  label: 'Continue with Facebook',
                  backgroundColor: const Color(0xFF1877F2),
                  foregroundColor: Colors.white,
                  onPressed:
                      () => context.read<AuthCubit>().signInWithFacebook(),
                ),
                const SizedBox(height: 12),
                _SocialAuthButton(
                  icon: 'assets/icons/apple_icon.svg',
                  label: 'Continue with Apple',
                  backgroundColor: Colors.black,
                  foregroundColor: Colors.white,
                  onPressed: () => context.read<AuthCubit>().signInWithApple(),
                ),

                const SizedBox(height: 32),

                // ---------- Divider ----------
                Row(
                  children: [
                    const Expanded(child: Divider(color: Color(0xFFE2E8F0))),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text(
                        'or continue with email',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppColors.darkSlate.withValues(alpha: 0.5),
                        ),
                      ),
                    ),
                    const Expanded(child: Divider(color: Color(0xFFE2E8F0))),
                  ],
                ),

                const SizedBox(height: 20),

                // ---------- Email/Password Form (TEMPORARY) ----------
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.alertAmber.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppColors.alertAmber.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Temporary badge
                        Row(
                          children: [
                            const Icon(
                              Icons.info_outline,
                              size: 16,
                              color: AppColors.alertAmber,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              'Temporary — available while Google Sign-In is being configured',
                              style: Theme.of(context).textTheme.labelSmall
                                  ?.copyWith(color: AppColors.alertAmber),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),

                        // Email field
                        TextFormField(
                          controller: _emailController,
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          autocorrect: false,
                          decoration: const InputDecoration(
                            labelText: 'Email',
                            prefixIcon: Icon(Icons.email_outlined),
                          ),
                          validator: (value) {
                            if (value == null || value.trim().isEmpty) {
                              return 'Please enter your email';
                            }
                            if (!value.contains('@')) {
                              return 'Please enter a valid email';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 12),

                        // Password field
                        TextFormField(
                          controller: _passwordController,
                          obscureText: _obscurePassword,
                          textInputAction: TextInputAction.done,
                          onFieldSubmitted: (_) => _submit(),
                          decoration: InputDecoration(
                            labelText: 'Password',
                            prefixIcon: const Icon(Icons.lock_outlined),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscurePassword
                                    ? Icons.visibility_off_outlined
                                    : Icons.visibility_outlined,
                              ),
                              onPressed: () {
                                setState(() {
                                  _obscurePassword = !_obscurePassword;
                                });
                              },
                            ),
                          ),
                          validator: (value) {
                            if (value == null || value.isEmpty) {
                              return 'Please enter your password';
                            }
                            if (_isSignUpMode && value.length < 6) {
                              return 'Password must be at least 6 characters';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 16),

                        // Submit button
                        BlocBuilder<AuthCubit, AuthState>(
                          builder: (context, state) {
                            final isLoading =
                                state.status == AuthStatus.loading;
                            return ElevatedButton(
                              onPressed: isLoading ? null : _submit,
                              child:
                                  isLoading
                                      ? const SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white,
                                        ),
                                      )
                                      : Text(
                                        _isSignUpMode
                                            ? 'Create Account'
                                            : 'Sign In',
                                      ),
                            );
                          },
                        ),
                        const SizedBox(height: 10),

                        // Toggle sign-in / sign-up
                        TextButton(
                          onPressed: () {
                            setState(() {
                              _isSignUpMode = !_isSignUpMode;
                              _formKey.currentState?.reset();
                            });
                          },
                          child: Text(
                            _isSignUpMode
                                ? 'Already have an account? Sign In'
                                : "Don't have an account? Create one",
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 24),

                // Terms of Service
                Text(
                  'By continuing, you agree to our Terms of Service\nand consent to emergency audio recording.',
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
      ),
    );
  }
}

/// Reusable social auth button widget.
class _SocialAuthButton extends StatelessWidget {
  final String icon;
  final String label;
  final Color backgroundColor;
  final Color foregroundColor;
  final Color? borderColor;
  final VoidCallback onPressed;

  const _SocialAuthButton({
    required this.icon,
    required this.label,
    required this.backgroundColor,
    required this.foregroundColor,
    this.borderColor,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton.icon(
        onPressed: onPressed,
        icon: const Icon(Icons.login, size: 20),
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
