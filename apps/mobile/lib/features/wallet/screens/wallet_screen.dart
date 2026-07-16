/// Wallet Screen — balance display, top-up, and transaction history.
///
/// Shows current wallet balance, a "Fund Wallet" button that initiates
/// Paystack checkout, and a scrollable transaction history list.
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../app/theme.dart';
import '../../../core/constants.dart';
import '../cubit/wallet_cubit.dart';
import 'payment_webview_screen.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  @override
  void initState() {
    super.initState();
    context.read<WalletCubit>().loadWallet();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Wallet'),
        centerTitle: true,
      ),
      body: BlocConsumer<WalletCubit, WalletState>(
        listener: (context, state) {
          if (state.status == WalletStatus.fundSuccess &&
              state.topUpReference != null &&
              state.authorizationUrl != null) {
            // Navigate to the in-app WebView for Paystack checkout.
            final cubit = context.read<WalletCubit>();
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => PaymentWebViewScreen(
                  authorizationUrl: state.authorizationUrl!,
                  reference: state.topUpReference!,
                ),
              ),
            );
            // Clear the auth URL so we don't re-navigate on rebuild.
            cubit.clearTopUpState();
          }
          if (state.errorMessage != null && state.status == WalletStatus.error) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.errorMessage!),
                backgroundColor: AppColors.emergencyRed,
              ),
            );
          }
        },
        builder: (context, state) {
          // Loading
          if (state.status == WalletStatus.initial ||
              state.status == WalletStatus.loading) {
            return const Center(child: CircularProgressIndicator());
          }

          // Error
          if (state.status == WalletStatus.error && state.wallet == null) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline, size: 48, color: AppColors.emergencyRed),
                  const SizedBox(height: 12),
                  Text(
                    state.errorMessage ?? 'Something went wrong',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () => context.read<WalletCubit>().loadWallet(),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            );
          }

          final wallet = state.wallet;

          return RefreshIndicator(
            onRefresh: () => context.read<WalletCubit>().loadWallet(),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // ── Balance Card ──
                _BalanceCard(wallet: wallet, isFunding: state.status == WalletStatus.funding),
                const SizedBox(height: 20),

                // ── Fund Wallet Button ──
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: FilledButton.icon(
                    onPressed: state.status == WalletStatus.funding
                        ? null
                        : () => _showTopUpDialog(context),
                    icon: const Icon(Icons.add_circle_outline),
                    label: Text(
                      state.status == WalletStatus.funding
                          ? 'Processing...'
                          : 'Fund Wallet',
                    ),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.safetyGreen,
                    ),
                  ),
                ),
                const SizedBox(height: 24),

                // ── Transaction History ──
                Text(
                  'Transaction History',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
                const SizedBox(height: 12),

                if (state.transactions.isEmpty)
                  _buildEmptyState(context)
                else
                  ...state.transactions.map((txn) => _TransactionTile(transaction: txn)),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const Icon(Icons.receipt_long_outlined,
                size: 48, color: Color(0xFF94A3B8)),
            const SizedBox(height: 12),
            Text(
              'No transactions yet',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 4),
            Text(
              'Fund your wallet to start monitoring journeys.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.darkSlate.withValues(alpha: 0.6),
                  ),
            ),
          ],
        ),
      ),
    );
  }

  void _showTopUpDialog(BuildContext context) {
    final amountController = TextEditingController(text: '2000');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Fund Wallet'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: amountController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Amount (₦)',
                prefixText: '₦ ',
                hintText: '2000',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Minimum: ₦$kMinWalletTopUp',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.darkSlate.withValues(alpha: 0.6),
                  ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final amount = double.tryParse(amountController.text) ?? 2000;
              Navigator.of(ctx).pop();
              context.read<WalletCubit>().fundWallet(amount);
            },
            child: const Text('Continue'),
          ),
        ],
      ),
    );
  }
}

/// Large balance display card.
class _BalanceCard extends StatelessWidget {
  final WalletInfo? wallet;
  final bool isFunding;

  const _BalanceCard({required this.wallet, this.isFunding = false});

  @override
  Widget build(BuildContext context) {
    final balance = wallet?.balance ?? 0;

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1E293B), Color(0xFF334155)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Color(0x331E293B),
            blurRadius: 16,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        children: [
          Text(
            'Available Balance',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Colors.white.withValues(alpha: 0.7),
                ),
          ),
          const SizedBox(height: 8),
          Text(
            '₦${balance.toStringAsFixed(2)}',
            style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 36,
                ),
          ),
          if (isFunding) ...[
            const SizedBox(height: 12),
            const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// A single transaction row.
class _TransactionTile extends StatelessWidget {
  final WalletTransaction transaction;

  const _TransactionTile({required this.transaction});

  @override
  Widget build(BuildContext context) {
    final isCredit = transaction.isCredit;
    final icon = _transactionIcon(transaction.type);
    final color = isCredit ? AppColors.safetyGreen : AppColors.emergencyRed;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.1),
          child: Icon(icon, color: color, size: 20),
        ),
        title: Text(
          transaction.description ?? transaction.type,
          style: Theme.of(context).textTheme.bodyMedium,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(
          transaction.createdAt.isNotEmpty
              ? transaction.createdAt.substring(0, 10)
              : '',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        trailing: Text(
          '${isCredit ? '+' : ''}₦${transaction.amount.abs().toStringAsFixed(0)}',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: color,
                fontWeight: FontWeight.w600,
              ),
        ),
      ),
    );
  }

  IconData _transactionIcon(String type) {
    return switch (type) {
      'deposit' => Icons.arrow_downward,
      'trip_charge' => Icons.route,
      'subscription_charge' => Icons.card_membership,
      'refund' => Icons.undo,
      'admin_adjustment' => Icons.admin_panel_settings,
      'withdrawal' => Icons.arrow_upward,
      _ => Icons.swap_horiz,
    };
  }
}
