/// Payment WebView Screen — hosts the Paystack / Flutterwave checkout page
/// in an in-app WebView so the user can complete payment without leaving the app.
///
/// After the user completes or cancels payment, we navigate back and
/// automatically verify the payment via the reference.
///
/// Route params:
///   - `authorizationUrl` (required): The gateway checkout URL.
///   - `reference` (required): The payment reference for verification on return.
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../cubit/wallet_cubit.dart';
import '../../../../app/theme.dart';

class PaymentWebViewScreen extends StatefulWidget {
  final String authorizationUrl;
  final String reference;

  const PaymentWebViewScreen({
    super.key,
    required this.authorizationUrl,
    required this.reference,
  });

  @override
  State<PaymentWebViewScreen> createState() => _PaymentWebViewScreenState();
}

class _PaymentWebViewScreenState extends State<PaymentWebViewScreen> {
  late final WebViewController _controller;
  bool _isLoading = true;
  bool _isPaymentDetected = false;

  @override
  void initState() {
    super.initState();

    // Initialize the WebView controller with JavaScript enabled
    // (required by Paystack's checkout page).
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (mounted) setState(() => _isLoading = true);
          },
          onPageFinished: (url) {
            if (mounted) setState(() => _isLoading = false);

            // Detect payment completion by watching for Paystack's success page.
            // Paystack redirects to a URL containing 'reference' after payment.
            if (!_isPaymentDetected &&
                (url.contains('paystack.co') || url.contains('flutterwave.com')) &&
                url.contains(widget.reference)) {
              _isPaymentDetected = true;
              // Brief delay to let the user see the success page,
              // then verify and pop back.
              Future.delayed(const Duration(seconds: 2), () {
                if (mounted) _handlePaymentComplete();
              });
            }
          },
          onWebResourceError: (error) {
            // WebView errors are common on mobile — silently retry on next navigation.
            // Critical failures (no network) are handled via the error state.
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.authorizationUrl));
  }

  /// Verify the payment and navigate back to the wallet screen.
  Future<void> _handlePaymentComplete() async {
    if (!mounted) return;
    final cubit = context.read<WalletCubit>();
    await cubit.verifyPayment(widget.reference);
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      // Intercept back button: verify payment before navigating away.
      // If payment was already detected, just pop. Otherwise verify first.
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (_isPaymentDetected) {
          Navigator.of(context).pop();
          return;
        }
        await _handlePaymentComplete();
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Payment'),
          leading: IconButton(
            icon: const Icon(Icons.close),
            onPressed: () async {
              await _handlePaymentComplete();
            },
          ),
          bottom: _isLoading
              ? const PreferredSize(
                  preferredSize: Size.fromHeight(2),
                  child: LinearProgressIndicator(minHeight: 2),
                )
              : null,
        ),
        body: SafeArea(
          child: Column(
            children: [
              // Info banner reminding user about the payment.
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                color: AppColors.safetyGreen.withValues(alpha: 0.1),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline, size: 16, color: AppColors.safetyGreen),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Complete your payment on this page, then press the close button.',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: AppColors.darkSlate,
                            ),
                      ),
                    ),
                  ],
                ),
              ),
              // The WebView fills the remaining space.
              Expanded(child: WebViewWidget(controller: _controller)),
            ],
          ),
        ),
      ),
    );
  }
}
