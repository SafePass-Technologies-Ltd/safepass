/// Transport Partner Dashboard — Company Profile Onboarding (T-01)
///
/// Post-login onboarding for transport partners after first sign-in.
'use client';

import { useState } from 'react';
import { Truck, ArrowRight } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface FormData {
  name: string;
  rcNumber: string;
  fleetSize: string;
  routesServed: string;
  address: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
}

const EMPTY_FORM: FormData = {
  name: '',
  rcNumber: '',
  fleetSize: '',
  routesServed: '',
  address: '',
  contactPerson: '',
  contactPhone: '',
  contactEmail: '',
};

export default function OnboardingPage() {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const org = await apiClient<{ id: string }>('/v1/organizations', {
        method: 'POST',
        body: JSON.stringify({
          type: 'transport_partner',
          name: form.name,
          rcNumber: form.rcNumber || undefined,
          industry: 'transport',
          address: form.address || undefined,
          contactPerson: form.contactPerson,
          contactPhone: form.contactPhone,
          contactEmail: form.contactEmail || undefined,
        }),
      });

      localStorage.setItem('pending_org_id', org.id);
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-lg space-y-6 rounded-2xl bg-white p-8 shadow-xl">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
            <Truck className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-dark">Transport Partner Setup</h1>
          <p className="mt-2 text-sm text-slate-500">
            Register your fleet to start monitoring trips and managing vehicles.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Company Name *
            </label>
            <input
              type="text" required
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g., Okafor Express"
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">RC Number</label>
              <input
                type="text"
                value={form.rcNumber}
                onChange={(e) => updateField('rcNumber', e.target.value)}
                placeholder="CAC registration"
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Fleet Size</label>
              <input
                type="number" min="1"
                value={form.fleetSize}
                onChange={(e) => updateField('fleetSize', e.target.value)}
                placeholder="Number of vehicles"
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Routes Served
            </label>
            <input
              type="text"
              value={form.routesServed}
              onChange={(e) => updateField('routesServed', e.target.value)}
              placeholder="e.g., Lagos-Benin, Abuja-Kaduna"
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Business Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => updateField('address', e.target.value)}
              placeholder="e.g., 45 Benin-Ore Road, Benin City"
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Contact Person *
              </label>
              <input
                type="text" required
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
                type="tel" required
                value={form.contactPhone}
                onChange={(e) => updateField('contactPhone', e.target.value)}
                placeholder="+2348012345678"
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Contact Email</label>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => updateField('contactEmail', e.target.value)}
              placeholder="fleet@company.com"
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

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
