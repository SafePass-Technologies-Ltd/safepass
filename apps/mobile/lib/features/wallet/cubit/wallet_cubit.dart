/// Wallet Cubit — manages wallet balance, top-up flow, and transaction history.
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';

// ────────────────────────────────────────────────────────────
// Models
// ────────────────────────────────────────────────────────────

class WalletInfo extends Equatable {
  final String id;
  final double balance;
  final String currency;
  final bool isActive;

  const WalletInfo({
    required this.id,
    required this.balance,
    this.currency = 'NGN',
    this.isActive = true,
  });

  factory WalletInfo.fromJson(Map<String, dynamic> json) => WalletInfo(
        id: json['id'] as String,
        balance: (json['balance'] as num).toDouble(),
        currency: json['currency'] as String? ?? 'NGN',
        isActive: json['isActive'] as bool? ?? true,
      );

  @override
  List<Object?> get props => [id, balance, currency, isActive];
}

class WalletTransaction extends Equatable {
  final String id;
  final String type;
  final double amount;
  final double balanceBefore;
  final double balanceAfter;
  final String? description;
  final String status;
  final String createdAt;

  const WalletTransaction({
    required this.id,
    required this.type,
    required this.amount,
    required this.balanceBefore,
    required this.balanceAfter,
    this.description,
    required this.status,
    required this.createdAt,
  });

  factory WalletTransaction.fromJson(Map<String, dynamic> json) =>
      WalletTransaction(
        id: json['id'] as String,
        type: json['transactionType'] as String? ?? 'unknown',
        amount: (json['amount'] as num).toDouble(),
        balanceBefore: (json['balanceBefore'] as num).toDouble(),
        balanceAfter: (json['balanceAfter'] as num).toDouble(),
        description: json['description'] as String?,
        status: json['status'] as String? ?? 'completed',
        createdAt: json['createdAt'] as String? ?? '',
      );

  bool get isCredit => amount > 0;

  @override
  List<Object?> get props =>
      [id, type, amount, balanceBefore, balanceAfter, description, status, createdAt];
}

// ────────────────────────────────────────────────────────────
// State
// ────────────────────────────────────────────────────────────

enum WalletStatus { initial, loading, loaded, funding, fundSuccess, error }

class WalletState extends Equatable {
  final WalletStatus status;
  final WalletInfo? wallet;
  final List<WalletTransaction> transactions;
  final String? errorMessage;
  final String? topUpReference;
  final String? authorizationUrl;

  const WalletState({
    this.status = WalletStatus.initial,
    this.wallet,
    this.transactions = const [],
    this.errorMessage,
    this.topUpReference,
    this.authorizationUrl,
  });

  WalletState copyWith({
    WalletStatus? status,
    WalletInfo? wallet,
    List<WalletTransaction>? transactions,
    String? errorMessage,
    String? topUpReference,
    String? authorizationUrl,
    bool clearAuthUrl = false,
  }) {
    return WalletState(
      status: status ?? this.status,
      wallet: wallet ?? this.wallet,
      transactions: transactions ?? this.transactions,
      errorMessage: errorMessage,
      topUpReference: topUpReference ?? this.topUpReference,
      authorizationUrl: clearAuthUrl ? null : (authorizationUrl ?? this.authorizationUrl),
    );
  }

  @override
  List<Object?> get props =>
      [status, wallet, transactions, errorMessage, topUpReference, authorizationUrl];
}

// ────────────────────────────────────────────────────────────
// Cubit
// ────────────────────────────────────────────────────────────

class WalletCubit extends Cubit<WalletState> {
  WalletCubit() : super(const WalletState());

  final _dio = ApiClient.instance.dio;

  /// Load wallet and transactions from the API.
  Future<void> loadWallet() async {
    emit(state.copyWith(status: WalletStatus.loading));

    try {
      final response = await _dio.get('/v1/wallets/me/transactions');
      final data = response.data as Map<String, dynamic>;

      final wallet = WalletInfo.fromJson(
        (data['wallet'] as Map<String, dynamic>?) ?? data,
      );

      final txns = ((data['transactions'] as List<dynamic>?) ?? [])
          .map((t) => WalletTransaction.fromJson(t as Map<String, dynamic>))
          .toList();

      emit(state.copyWith(
        status: WalletStatus.loaded,
        wallet: wallet,
        transactions: txns,
      ));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: WalletStatus.error,
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Failed to load wallet',
      ));
    }
  }

  /// Initialize a wallet top-up via Paystack.
  Future<void> fundWallet(double amount) async {
    if (amount < 2000) {
      emit(state.copyWith(
        status: WalletStatus.error,
        errorMessage: 'Minimum top-up is ₦2,000',
      ));
      return;
    }

    emit(state.copyWith(status: WalletStatus.funding));

    try {
      final response = await _dio.post(
        '/v1/payments/initialize',
        data: {'amount': amount, 'gateway': 'paystack'},
      );

      final data = response.data as Map<String, dynamic>;
      final reference = data['reference'] as String;
      final authorizationUrl = data['authorizationUrl'] as String;

      emit(state.copyWith(
        status: WalletStatus.fundSuccess,
        topUpReference: reference,
        authorizationUrl: authorizationUrl,
      ));
    } on DioException catch (e) {
      emit(state.copyWith(
        status: WalletStatus.error,
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Top-up initiation failed',
      ));
    }
  }

  /// Verify a payment after returning from checkout.
  Future<void> verifyPayment(String reference) async {
    try {
      await _dio.post('/v1/payments/verify', data: {'reference': reference});
      // Reload wallet to get updated balance.
      await loadWallet();
    } on DioException catch (e) {
      emit(state.copyWith(
        errorMessage:
            e.response?.data?['error']?['message'] ?? 'Payment verification failed',
      ));
    }
  }

  /// Clear the top-up state after the WebView has been opened.
  void clearTopUpState() {
    emit(state.copyWith(clearAuthUrl: true, topUpReference: null));
  }
}
