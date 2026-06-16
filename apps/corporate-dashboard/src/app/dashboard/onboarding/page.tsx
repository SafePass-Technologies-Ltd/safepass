/// Corporate Dashboard — Company Profile Onboarding
///
/// Shown after first login when the user doesn't have an organization yet.
/// Collects company registration details and submits them via
/// POST /v1/organizations. The user does NOT get dashboard access
/// immediately — the API creates a pending role_upgrade_requests entry and
/// an admin must approve it before the user becomes corporate_admin.
'use client';

import { useState } from 'react';
import { Building2, ArrowRight, Clock } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface FormData {
  name: string;
  rcNumber: string;
  industry: string;
  address: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
}

const EMPTY_FORM: FormData = {
  name: '',
  rcNumber: '',
  industry: '',
  address: '',
  contactPerson: '',
  contactPhone: '',
  contactEmail: '',
};

const INDUSTRIES = [
  'banking', 'oil_gas', 'logistics', 'telecoms', 'manufacturing',
  'construction', 'agriculture', 'education', 'healthcare', 'government',
  'technology', 'retail', 'hospitality', 'consulting', 'other',
];

export default function OnboardingPage() {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once submitted, the request is pending admin review — the user does not
  // get dashboard access yet, so we show a waiting state instead of redirecting.
  const [submitted, setSubmitted] = useState(false);

  function updateField(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiClient('/v1/organizations', {
        method: 'POST',
        body: JSON.stringify({
          type: 'corporate',
          name: form.name,
          rcNumber: form.rcNumber || undefined,
          industry: form.industry || undefined,
          address: form.address || undefined,
          contactPerson: form.contactPerson,
          contactPhone: form.contactPhone,
          contactEmail: form.contactEmail || undefined,
        }),
      });

      // Mark this device as "awaiting approval" so the layout guard stops
      // redirecting back into onboarding on every navigation. Dashboard
      // access is only unlocked once an admin approves and the user signs
      // in again with a fresh JWT carrying corporate_admin + orgId.
      localStorage.setItem('pending_role_upgrade', 'true');
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit organization for review');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-amber-100">
            <Clock className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-dark">Pending Admin Approval</h1>
          <p className="text-sm text-slate-500">
            Your request has been submitted and is pending admin approval. You will be notified
            and gain dashboard access once a SafePass administrator reviews and approves your
            organization.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-lg space-y-6 rounded-2xl bg-white p-8 shadow-xl">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-dark">Company Profile</h1>
          <p className="mt-2 text-sm text-slate-500">
            Set up your organization to start monitoring staff trips.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Company Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Company Name *
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g., Zenith Bank Plc"
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* RC Number */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              RC Number
            </label>
            <input
              type="text"
              value={form.rcNumber}
              onChange={(e) => updateField('rcNumber', e.target.value)}
              placeholder="CAC registration number"
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Industry */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Industry
            </label>
            <select
              value={form.industry}
              onChange={(e) => updateField('industry', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Select industry...</option>
              {INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>
                  {ind.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          {/* Address */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Business Address
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => updateField('address', e.target.value)}
              placeholder="e.g., 123 Herbert Macaulay Way, Lagos"
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Contact Person */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Contact Person *
              </label>
              <input
                type="text"
                required
                value={form.contactPerson}
                onChange={(e) => updateField('contactPerson', e.target.value)}
                placeholder="Full name"
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Contact Phone *
              </label>
              <input
                type="tel"
                required
                value={form.contactPhone}
                onChange={(e) => updateField('contactPhone', e.target.value)}
                placeholder="+2348012345678"
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Contact Email */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Contact Email
            </label>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => updateField('contactEmail', e.target.value)}
              placeholder="admin@company.com"
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !form.name || !form.contactPerson || !form.contactPhone}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Complete Setup'}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
