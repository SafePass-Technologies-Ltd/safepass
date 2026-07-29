'use client';

import type {
  DemoRequestInput,
  LeadType,
  PartnerInquiryInput,
  WaitlistSignupInput,
} from '@safepass/shared';

/**
 * Client-side lead submission.
 *
 * All three forms (waitlist, demo request, partner inquiry) route through this
 * one function, per FEAT-012's requirement that they "submit into a single,
 * consistent lead-delivery mechanism, tagged by type and source page". Adding a
 * fourth lead type should mean adding a variant here, never a second transport.
 */

export type LeadInput = WaitlistSignupInput | DemoRequestInput | PartnerInquiryInput;

/**
 * Result of a submission attempt.
 *
 * Modelled as a discriminated union rather than throwing, because the form UI
 * has to distinguish three outcomes with three different states: field-level
 * validation errors (stay editable, show inline), delivery failure (preserve
 * data, offer Retry + fallback contact), and success (replace form with
 * confirmation). A thrown error would collapse the first two together.
 */
export type LeadSubmitResult =
  | { ok: true }
  | { ok: false; kind: 'validation'; fields: Record<string, string[]> }
  | { ok: false; kind: 'delivery'; message: string };

export interface SubmitLeadOptions {
  leadType: LeadType;
  /** Canonical path the form lives on, e.g. '/business'. */
  sourcePage: string;
  input: LeadInput;
  /**
   * Stable correlation ID for this submission attempt.
   *
   * The CALLER owns this and must reuse the same value across retries of the
   * same submission — that is what lets the backend deduplicate rather than
   * create a second lead when a visitor retries after an ambiguous timeout.
   * Generating it inside this function would defeat the whole mechanism.
   */
  submissionId: string;
}

export async function submitLead({
  leadType,
  sourcePage,
  input,
  submissionId,
}: SubmitLeadOptions): Promise<LeadSubmitResult> {
  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        submissionId,
        leadType,
        sourcePage,
        submittedAt: new Date().toISOString(),
        ...input,
      }),
    });

    if (response.ok) return { ok: true };

    const body = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string; fields?: Record<string, string[]> } }
      | null;

    if (response.status === 400 && body?.error?.fields) {
      return { ok: false, kind: 'validation', fields: body.error.fields };
    }

    return {
      ok: false,
      kind: 'delivery',
      message: body?.error?.message ?? "We couldn't submit your details just now.",
    };
  } catch {
    // Network failure, offline, or the request never left the device.
    return {
      ok: false,
      kind: 'delivery',
      message: "We couldn't reach our servers. Check your connection and try again.",
    };
  }
}

/**
 * Generates a submission correlation ID.
 *
 * `crypto.randomUUID` is unavailable on insecure origins and in older mobile
 * browsers — a real concern for the low-end Android devices in Amaka's
 * persona, so the fallback is not theoretical.
 */
export function createSubmissionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // RFC 4122 v4 shape, adequate for correlation (not used as a security token).
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => {
    const n = Number(c);
    return (n ^ (Math.random() * 16) & (15 >> (n / 4))).toString(16);
  });
}
