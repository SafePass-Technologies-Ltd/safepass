/// Phone Authentication Screen — phone number input + OTP verification.
library phone_auth_screen;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme.dart';
import '../../../app/router.dart';
import '../cubit/auth_cubit.dart';

class PhoneAuthScreen extends StatefulWidget {
  const PhoneAuthScreen({super.key});

  @override
  State<PhoneAuthScreen> createState() => _PhoneAuthScreenState();
}

class _PhoneAuthScreenState extends State<PhoneAuthScreen> {
  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();
  final _phoneFormKey = GlobalKey<FormState>();
  final _otpFormKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _phoneController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<AuthCubit, AuthState>(
      listener: (context, state) {
        // On error, show snackbar
        if (state.status == AuthStatus.error &&
            state.errorMessage != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(state.errorMessage!),
              backgroundColor: AppColors.emergencyRed,
            ),
          );
        }
      },
      builder: (context, state) {
        return Scaffold(
          appBar: AppBar(
            title: const Text('Phone Sign-In'),
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () {
                context.read<AuthCubit>().cancelPhoneSignIn();
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go(AppRoutes.login);
                }
              },
            ),
          ),
          body: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: state.status == AuthStatus.phoneOtpSent
                  ? _buildOtpInput(context, state)
                  : _buildPhoneInput(context, state),
            ),
          ),
        );
      },
    );
  }

  /// Phone number input form.
  Widget _buildPhoneInput(BuildContext context, AuthState state) {
    final isSending =
        state.phoneAuthStep == PhoneAuthStep.sendingCode;

    return Form(
      key: _phoneFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 24),
          Icon(
            Icons.phone_android_outlined,
            size: 64,
            color: AppColors.primary.withValues(alpha: 0.6),
          ),
          const SizedBox(height: 24),
          Text(
            'Enter your phone number',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: AppColors.darkSlate,
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            'We\'ll send a verification code via SMS.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppColors.darkSlate.withValues(alpha: 0.6),
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),

          // Phone number field
          TextFormField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.done,
            enabled: !isSending,
            decoration: const InputDecoration(
              labelText: 'Phone Number',
              hintText: '+2348012345678',
              prefixIcon: Icon(Icons.phone_outlined),
              helperText: 'Include country code (e.g., +234)',
            ),
            validator: (value) {
              if (value == null || value.trim().isEmpty) {
                return 'Please enter your phone number';
              }
              if (!value.trim().startsWith('+')) {
                return 'Please include the country code (e.g., +234)';
              }
              if (value.trim().length < 10) {
                return 'Please enter a valid phone number';
              }
              return null;
            },
            onFieldSubmitted: (_) => _submitPhoneNumber(context),
          ),
          const SizedBox(height: 24),

          // Send code button
          ElevatedButton(
            onPressed: isSending ? null : () => _submitPhoneNumber(context),
            child: isSending
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('Send Verification Code'),
          ),
        ],
      ),
    );
  }

  /// OTP input form (shown after SMS is sent).
  Widget _buildOtpInput(BuildContext context, AuthState state) {
    final isVerifying =
        state.phoneAuthStep == PhoneAuthStep.verifyingOtp;
    final phoneNumber = state.phoneNumber ?? '';

    return Form(
      key: _otpFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 24),
          Icon(
            Icons.sms_outlined,
            size: 64,
            color: AppColors.safetyGreen.withValues(alpha: 0.6),
          ),
          const SizedBox(height: 24),
          Text(
            'Verify your phone',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: AppColors.darkSlate,
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            'Enter the 6-digit code sent to $phoneNumber',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppColors.darkSlate.withValues(alpha: 0.6),
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),

          // OTP field
          TextFormField(
            controller: _otpController,
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.done,
            enabled: !isVerifying,
            maxLength: 6,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  letterSpacing: 8,
                  fontWeight: FontWeight.w600,
                ),
            decoration: const InputDecoration(
              labelText: 'Verification Code',
              prefixIcon: Icon(Icons.pin_outlined),
              counterText: '',
            ),
            validator: (value) {
              if (value == null || value.trim().isEmpty) {
                return 'Please enter the verification code';
              }
              if (value.trim().length < 6) {
                return 'Please enter the full 6-digit code';
              }
              return null;
            },
            onFieldSubmitted: (_) => _submitOtp(context),
          ),
          const SizedBox(height: 24),

          // Verify button
          ElevatedButton(
            onPressed: isVerifying ? null : () => _submitOtp(context),
            child: isVerifying
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('Verify'),
          ),
          const SizedBox(height: 16),

          // Resend / change number
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              TextButton(
                onPressed: () {
                  // Go back to phone input
                  context.read<AuthCubit>().cancelPhoneSignIn();
                  setState(() {
                    _phoneController.clear();
                    _otpController.clear();
                  });
                  // Re-enter phone number flow
                },
                child: const Text('Change phone number'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _submitPhoneNumber(BuildContext context) {
    if (!_phoneFormKey.currentState!.validate()) return;
    final phone = _phoneController.text.trim();
    context.read<AuthCubit>().startPhoneSignIn(phone);
  }

  void _submitOtp(BuildContext context) {
    if (!_otpFormKey.currentState!.validate()) return;
    final otp = _otpController.text.trim();
    context.read<AuthCubit>().verifyPhoneOtp(otp);
  }
}
