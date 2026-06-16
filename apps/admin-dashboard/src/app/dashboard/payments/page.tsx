'use client';

import { useState, useEffect } from 'react';
import { RotateCcw, Wallet } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface Transaction {
  id: string;
  walletId: string;
  type: string;
  amount: number;
  status: string;
  reference: string | null;
  description: string | null;
  createdAt: string;
}

const TYPE_STYLE: Record<string, { bg: string; text: string }> = {
  credit: { bg: 'bg-green-100', text: 'text-green-700' },
  debit: { bg: 'bg-red-100', text: 'text-red-600' },
  refund: { bg: 'bg-blue-100', text: 'text-blue-700' },
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  success: { bg: 'bg-green-100', text: 'text-green-700' },
  pending: { bg: 'bg-amber-100', text: 'text-amber-700' },
  failed: { bg: 'bg-red-100', text: 'text-red-600' },
};

export default function PaymentsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchTransactions() {
    setLoading(true);
    setError(null);
    try {
      // Fetch transactions for the platform wallet (admin view).
      // Uses /v1/wallets/me/transactions — admin token gives full access.
      const data = await apiClient<{ transactions: Transaction[] }>(
        '/v1/wallets/me/transactions?limit=100'
      );
      setTransactions(data.transactions ?? []);
    } catch {
      setError('Failed to load transactions. Is the API server running?');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTransactions();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-dark">Payments & Wallet</h1>
          <p className="mt-1 text-sm text-slate-500">
            Platform transaction history and wallet management.
          </p>
        </div>
        <button
          onClick={fetchTransactions}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Wallet className="h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-600">No transactions yet</h3>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">Reference</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx) => {
                  const typeStyle = TYPE_STYLE[tx.type] ?? { bg: 'bg-slate-100', text: 'text-slate-600' };
                  const statusStyle = STATUS_STYLE[tx.status] ?? { bg: 'bg-slate-100', text: 'text-slate-600' };
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 text-xs font-mono text-slate-500">
                        {tx.reference ?? tx.id.slice(0, 8) + '…'}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-700">
                        {tx.description ?? '—'}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${typeStyle.bg} ${typeStyle.text}`}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm font-semibold text-slate-dark">
                        ₦{(tx.amount / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusStyle.bg} ${statusStyle.text}`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-500">
                        {new Date(tx.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && (
        <p className="text-xs text-slate-400">
          Showing {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
