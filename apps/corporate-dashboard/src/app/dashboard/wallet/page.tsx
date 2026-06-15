/// Corporate Dashboard — Wallet (C-07)
///
/// Displays the organization wallet balance, transaction history,
/// and provides a funding button for Paystack top-up.
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wallet, ArrowDown, ArrowUp, RefreshCw, Loader2, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getUserSession } from '@/lib/auth-utils';

interface WalletData {
  id: string;
  balance: number;
  currency: string;
  isActive: boolean;
}

interface WalletTransaction {
  id: string;
  transactionType: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  status: string;
  createdAt: string;
}

export default function WalletPage() {
  const session = getUserSession();
  const orgId = session?.orgId;

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);
  const [fundAmount, setFundAmount] = useState('50000');
  const [showFundModal, setShowFundModal] = useState(false);

  const fetchWallet = useCallback(async () => {
    if (!orgId) return;
    try {
      const [walletData, txnsData] = await Promise.all([
        apiClient<WalletData>(`/v1/organizations/${orgId}/wallet`),
        apiClient<{ transactions: WalletTransaction[] }>(
          `/v1/organizations/${orgId}/wallet/transactions`
        ),
      ]);
      setWallet(walletData);
      setTransactions(txnsData.transactions);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallet');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  async function handleFundWallet(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(fundAmount);
    if (isNaN(amount) || amount < 2000) {
      setError('Minimum top-up is ₦2,000');
      return;
    }
    setFunding(true);
    setError(null);
    try {
      // Initialize payment via Paystack.
      const result = await apiClient<{ authorizationUrl: string; reference: string }>(
        '/v1/payments/initialize',
        {
          method: 'POST',
          body: JSON.stringify({ amount, gateway: 'paystack' }),
        }
      );
      // Open Paystack checkout in a new tab.
      window.open(result.authorizationUrl, '_blank');
      setShowFundModal(false);
      // Poll for payment verification after a delay.
      setTimeout(() => {
        apiClient('/v1/payments/verify', {
          method: 'POST',
          body: JSON.stringify({ reference: result.reference }),
        })
          .then(() => fetchWallet())
          .catch(() => {/* will retry on next refresh */});
      }, 15000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize payment');
    } finally {
      setFunding(false);
    }
  }

  // ── No org yet ──
  if (!orgId) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Wallet className="mb-4 h-12 w-12 text-slate-300" />
        <p className="text-slate-500">Complete company setup to access the wallet.</p>
      </div>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Corporate Wallet</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your organization&apos;s pre-funded trip payments.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchWallet}
            className="rounded-xl border border-slate-200 p-2.5 text-slate-500 transition-colors hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <button
            onClick={() => setShowFundModal(true)}
            disabled={!wallet?.isActive}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Fund Wallet
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Balance Card */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-dark to-slate-700 p-8 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/10 p-2">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-white/60">Available Balance</p>
            <p className="text-3xl font-bold">
              ₦{wallet?.balance.toLocaleString() ?? '0'}
            </p>
          </div>
        </div>
        {wallet && !wallet.isActive && (
          <div className="mt-3 rounded-lg bg-yellow-500/20 px-3 py-2 text-xs text-yellow-200">
            Wallet is frozen. Contact SafePass support.
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-slate-dark">
          Transaction History
        </h2>
        {transactions.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-400">No transactions yet.</p>
            <p className="mt-1 text-xs text-slate-300">
              Fund the wallet to start monitoring staff trips.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {transactions.map((txn) => {
              const isCredit = txn.amount > 0;
              const typeLabel = txn.transactionType
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase());
              return (
                <div
                  key={txn.id}
                  className="flex items-center gap-4 border-b border-slate-50 px-4 py-3 last:border-0"
                >
                  <div
                    className={`rounded-lg p-2 ${
                      isCredit ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                    }`}
                  >
                    {isCredit ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-dark">
                      {txn.description ?? typeLabel}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(txn.createdAt).toLocaleDateString('en-NG', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {' · '}
                      {typeLabel}
                      {' · Balance: ₦'}{txn.balanceAfter.toLocaleString()}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-semibold ${
                      isCredit ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {isCredit ? '+' : ''}₦{Math.abs(txn.amount).toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Fund Wallet Modal */}
      {showFundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-dark">Fund Corporate Wallet</h2>
            <p className="mt-1 text-sm text-slate-500">
              You will be redirected to Paystack to complete the payment.
            </p>
            <form onSubmit={handleFundWallet} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Amount (₦) *
                </label>
                <input
                  type="number"
                  required
                  min="2000"
                  step="1000"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  placeholder="50000"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <p className="mt-1 text-xs text-slate-400">Minimum: ₦2,000</p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowFundModal(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={funding}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {funding ? 'Processing...' : 'Continue to Paystack'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
