/// Transport Dashboard — Subscription Management (T-20)
///
/// Transport partner admin views their current subscription plan and org wallet
/// balance, browses available named plans (Standard / Fleet / Enterprise) plus
/// a Custom plan with live price preview, and activates a plan immediately via
/// wallet deduction (no admin approval step).
///
/// Shares the same API endpoints as the corporate subscription page:
///   GET  /v1/org/subscription              — plan + wallet balance
///   GET  /v1/org/subscription/price        — live price preview for Custom
///   POST /v1/org/subscription/activate     — wallet-deduct and activate
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader2,
  X,
  Users,
  Zap,
  Building2,
  Wallet,
  ChevronRight,
  ArrowUpRight,
  CreditCard,
} from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

// ── Types ───────────────────────────────────────────────────────────────────

type SubscriptionStatus = 'active' | 'pending' | 'none';
type Plan = 'starter' | 'business' | 'enterprise' | 'standard' | 'fleet' | 'custom';

interface PlanTier {
  plan: Exclude<Plan, 'custom'>;
  label: string;
  monthlyNgn: number;
  slots: number;
  description: string;
}

interface PlanPriceResult {
  plan: string;
  slots: number;
  priceNgn: number;
  priceFormatted: string;
}

interface SubscriptionData {
  orgId: string;
  orgName: string;
  orgType: 'corporate' | 'transport_partner';
  subscriptionPlan: Plan | 'none';
  slotCount: number;
  customSlotCount: number | null;
  status: SubscriptionStatus;
  walletBalance: number;
  walletBalanceFormatted: string;
  pendingRequest: { id: string; requestedPlan: Plan; requestedSlotCount: number; createdAt: string } | null;
  availablePlans: PlanTier[];
}

interface ActivateResult {
  org: { subscriptionPlan: string; slotCount: number };
  transaction: { amount: number; description: string; balanceBefore: number; balanceAfter: number };
  walletBalance: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatNgn(amount: number): string {
  return `₦${amount.toLocaleString('en-NG')}`;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
        <CheckCircle className="h-3.5 w-3.5" /> Active
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">
        <Clock className="h-3.5 w-3.5" /> Pending Approval
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-500">
      No Plan
    </span>
  );
}

interface PlanCardProps {
  tier: PlanTier;
  isCurrent: boolean;
  onSelect: () => void;
}

function PlanCard({ tier, isCurrent, onSelect }: PlanCardProps) {
  const isHighlighted = tier.plan === 'fleet';

  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 transition-shadow ${
        isHighlighted
          ? 'border-primary bg-primary/5 shadow-md'
          : 'border-slate-200 bg-white hover:shadow-sm'
      }`}
    >
      {isHighlighted && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-white shadow">
          Most Popular
        </span>
      )}
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-dark">{tier.label}</h3>
        <p className="mt-0.5 text-sm text-slate-500">{tier.description}</p>
      </div>
      <div className="mb-4">
        <span className="text-3xl font-bold text-slate-dark">{formatNgn(tier.monthlyNgn)}</span>
        <span className="ml-1 text-sm text-slate-400">/month</span>
      </div>
      <div className="mb-6 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
        <Users className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-medium text-slate-600">Up to {tier.slots} member slots</span>
      </div>
      {isCurrent ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 py-2.5 text-sm font-semibold text-green-700">
          <CheckCircle className="h-4 w-4" /> Current Plan
        </div>
      ) : (
        <button
          onClick={onSelect}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
            isHighlighted
              ? 'bg-primary text-white shadow-sm hover:bg-primary/90'
              : 'border border-primary/30 bg-white text-primary hover:bg-primary/5'
          }`}
        >
          Choose Plan
        </button>
      )}
    </div>
  );
}

interface CustomPlanCardProps {
  isCurrent: boolean;
  currentCustomSlots: number | null;
  onSelect: (slots: number, price: PlanPriceResult) => void;
}

function CustomPlanCard({ isCurrent, currentCustomSlots, onSelect }: CustomPlanCardProps) {
  const [slots, setSlots] = useState<string>(String(currentCustomSlots ?? 15));
  const [preview, setPreview] = useState<PlanPriceResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPreview = useCallback(async (slotCount: number) => {
    if (slotCount < 5) { setPreview(null); return; }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await apiClient<PlanPriceResult>(
        `/v1/org/subscription/price?plan=custom&slots=${slotCount}`
      );
      setPreview(result);
    } catch {
      setPreviewError('Could not calculate price. Please try again.');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    const num = parseInt(slots, 10);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!isNaN(num)) fetchPreview(num);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [slots, fetchPreview]);

  useEffect(() => {
    const num = parseInt(slots, 10);
    if (!isNaN(num)) fetchPreview(num);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const slotsNum = parseInt(slots, 10);
  const isValidSlots = !isNaN(slotsNum) && slotsNum >= 5;

  return (
    <div className="relative flex flex-col rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-dark">Custom</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          Any slot count from 5. Price calculated by tiered per-slot rates.
        </p>
      </div>
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-500 mb-1.5" htmlFor="custom-slots-transport">
          Number of slots (min 5)
        </label>
        <input
          id="custom-slots-transport"
          type="number"
          min={5}
          value={slots}
          onChange={(e) => setSlots(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-dark focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
          placeholder="e.g. 15"
        />
        {!isValidSlots && slots !== '' && (
          <p className="mt-1 text-xs text-red-500">Minimum 5 slots required</p>
        )}
      </div>
      <div className="mb-6 rounded-lg bg-slate-50 px-3 py-2.5 min-h-[48px] flex items-center">
        {previewLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        ) : previewError ? (
          <p className="text-xs text-red-500">{previewError}</p>
        ) : preview ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-slate-dark">{preview.priceFormatted}</span>
            <span className="text-sm text-slate-400">/month</span>
            <span className="ml-2 text-xs text-slate-400">· {preview.slots} slots</span>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Enter a slot count to see pricing</p>
        )}
      </div>
      {isCurrent ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 py-2.5 text-sm font-semibold text-green-700">
          <CheckCircle className="h-4 w-4" /> Current Plan ({currentCustomSlots} slots)
        </div>
      ) : (
        <button
          onClick={() => preview && isValidSlots && onSelect(slotsNum, preview)}
          disabled={!preview || !isValidSlots || previewLoading}
          className="rounded-xl border border-primary/30 bg-white px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Choose Custom Plan
        </button>
      )}
    </div>
  );
}

interface ActivateModalProps {
  planLabel: string;
  slots: number;
  priceNgn: number;
  walletBalance: number;
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
}

function ActivateModal({ planLabel, slots, priceNgn, walletBalance, onConfirm, onCancel, submitting }: ActivateModalProps) {
  const sufficient = walletBalance >= priceNgn;
  const shortfall = priceNgn - walletBalance;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Activate {planLabel} Plan</h2>
            <p className="mt-1 text-sm text-slate-500">
              {formatNgn(priceNgn)}/month &middot; {slots} member slots
            </p>
          </div>
          <button onClick={onCancel} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`mb-5 rounded-xl border p-4 ${sufficient ? 'border-blue-100 bg-blue-50' : 'border-red-100 bg-red-50'}`}>
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className={sufficient ? 'text-blue-700' : 'text-red-700'}>Wallet balance</span>
            <span className={`font-semibold ${sufficient ? 'text-blue-800' : 'text-red-800'}`}>{formatNgn(walletBalance)}</span>
          </div>
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className={sufficient ? 'text-blue-700' : 'text-red-700'}>Amount to deduct</span>
            <span className={`font-semibold ${sufficient ? 'text-blue-800' : 'text-red-800'}`}>- {formatNgn(priceNgn)}</span>
          </div>
          <div className="mt-2 border-t border-current/10 pt-2 flex items-center justify-between text-sm">
            <span className={`font-medium ${sufficient ? 'text-blue-700' : 'text-red-700'}`}>Balance after</span>
            <span className={`font-bold ${sufficient ? 'text-blue-800' : 'text-red-800'}`}>{formatNgn(Math.max(0, walletBalance - priceNgn))}</span>
          </div>
          {!sufficient && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-red-600">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              Insufficient balance. Top up {formatNgn(shortfall)} to activate this plan.
            </div>
          )}
        </div>

        {sufficient ? (
          <p className="mb-5 text-sm text-slate-500">
            The subscription fee will be deducted from your org wallet immediately.
            Renewal is billed monthly from your org wallet.
          </p>
        ) : (
          <Link
            href="/dashboard/wallet"
            className="mb-5 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <div className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Top up wallet</div>
            <div className="flex items-center gap-1">
              <span className="text-xs">Fund {formatNgn(shortfall)} more</span>
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </Link>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!sufficient || submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? 'Activating…' : 'Activate Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function SubscriptionPage() {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{
    plan: Plan;
    planLabel: string;
    slots: number;
    priceNgn: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState<ActivateResult | null>(null);

  const fetchSubscription = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient<SubscriptionData>('/v1/org/subscription');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription details');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSubscription(); }, [fetchSubscription]);

  async function handleActivateConfirm() {
    if (!pendingSelection) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiClient<ActivateResult>('/v1/org/subscription/activate', {
        method: 'POST',
        body: JSON.stringify({
          plan: pendingSelection.plan,
          ...(pendingSelection.plan === 'custom' ? { customSlotCount: pendingSelection.slots } : {}),
        }),
      });
      setSuccessResult(result);
      setPendingSelection(null);
      await fetchSubscription();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate subscription.');
      setPendingSelection(null);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <AlertTriangle className="h-10 w-10 text-red-400" />
        <p className="text-sm font-medium text-slate-600">{error}</p>
        <button onClick={fetchSubscription} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  const planIcon = data.status === 'active'
    ? <Zap className="h-6 w-6 text-primary" />
    : data.status === 'pending'
      ? <Clock className="h-6 w-6 text-amber-500" />
      : <Building2 className="h-6 w-6 text-slate-400" />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-dark">Subscription</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your fleet&apos;s monitoring plan and member slots.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {successResult && (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-800">Plan activated</p>
            <p className="mt-0.5 text-sm text-green-700">
              {successResult.transaction.description}.{' '}
              {formatNgn(successResult.transaction.amount)} deducted from your wallet.
              New balance: {formatNgn(successResult.walletBalance)}.
            </p>
          </div>
          <button onClick={() => setSuccessResult(null)}><X className="h-4 w-4 text-green-600" /></button>
        </div>
      )}

      {/* Current plan + wallet */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            {planIcon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Current Plan</p>
            <p className="mt-0.5 text-lg font-bold text-slate-dark capitalize">
              {data.subscriptionPlan === 'none' ? 'No active plan' : data.subscriptionPlan}
            </p>
            {data.subscriptionPlan !== 'none' && (
              <p className="mt-0.5 text-sm text-slate-500">
                {data.slotCount} member slot{data.slotCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <StatusBadge status={data.status} />
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-50">
            <Wallet className="h-6 w-6 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Org Wallet Balance</p>
            <p className="mt-0.5 text-lg font-bold text-slate-dark">{data.walletBalanceFormatted}</p>
            <p className="mt-0.5 text-xs text-slate-400">Used for subscription billing</p>
          </div>
          <Link
            href="/dashboard/wallet"
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors flex-shrink-0"
          >
            Top up <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Plan tiers */}
      <div>
        <h2 className="mb-1 text-base font-semibold text-slate-dark">Choose a Plan</h2>
        <p className="mb-4 text-sm text-slate-500">
          Billed monthly from your org wallet. Activation is immediate upon sufficient balance.
        </p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {data.availablePlans.map((tier) => (
            <PlanCard
              key={tier.plan}
              tier={tier}
              isCurrent={data.subscriptionPlan === tier.plan}
              onSelect={() => {
                setPendingSelection({ plan: tier.plan, planLabel: tier.label, slots: tier.slots, priceNgn: tier.monthlyNgn });
                setSuccessResult(null);
                setError(null);
              }}
            />
          ))}
          <CustomPlanCard
            isCurrent={data.subscriptionPlan === 'custom'}
            currentCustomSlots={data.customSlotCount}
            onSelect={(slots, price) => {
              setPendingSelection({ plan: 'custom', planLabel: 'Custom', slots, priceNgn: price.priceNgn });
              setSuccessResult(null);
              setError(null);
            }}
          />
        </div>
      </div>

      {/* Pricing note */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        <p className="font-medium text-slate-700 mb-1">Custom plan pricing</p>
        <p>
          5–19 slots ₦4,000/slot &middot; 20–49 slots ₦3,500/slot &middot; 50–99 slots ₦3,000/slot
          &middot; 100+ slots ₦2,500/slot. Named plans include savings vs. the Custom equivalent.
        </p>
      </div>

      {pendingSelection && data && (
        <ActivateModal
          planLabel={pendingSelection.planLabel}
          slots={pendingSelection.slots}
          priceNgn={pendingSelection.priceNgn}
          walletBalance={data.walletBalance}
          onConfirm={handleActivateConfirm}
          onCancel={() => setPendingSelection(null)}
          submitting={submitting}
        />
      )}
    </div>
  );
}
