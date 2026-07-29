import { describe, expect, it } from 'vitest';
import {
  DemoRequestInputSchema,
  LeadPayloadSchema,
  PartnerInquiryInputSchema,
  WaitlistSignupInputSchema,
} from '@safepass/shared';

/**
 * Foundation tests for the lead data contracts (schema.md).
 *
 * These guard the boundary all three lead-capture forms depend on. A contract
 * regression here would surface as a silently dropped or malformed lead —
 * risk_log.md R-004, scored Impact 5 — so the required-field and cross-field
 * rules are asserted rather than assumed.
 */

const envelope = {
  submissionId: '3f7c1c8e-1a2b-4c3d-8e4f-5a6b7c8d9e0f',
  sourcePage: '/individual',
  submittedAt: '2026-07-27T10:00:00.000Z',
};

describe('WaitlistSignupInputSchema', () => {
  it('accepts an email alone — phone and city are optional', () => {
    const result = WaitlistSignupInputSchema.safeParse({ email: 'amaka@example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed email', () => {
    const result = WaitlistSignupInputSchema.safeParse({ email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing email', () => {
    expect(WaitlistSignupInputSchema.safeParse({}).success).toBe(false);
  });
});

describe('DemoRequestInputSchema', () => {
  const valid = {
    contactName: 'Tunde Bakare',
    workEmail: 'tunde@example.com',
    companyName: 'Example Bank',
  };

  it('accepts the three required fields without the optional ones', () => {
    expect(DemoRequestInputSchema.safeParse(valid).success).toBe(true);
  });

  it.each(['contactName', 'workEmail', 'companyName'])('requires %s', (field) => {
    const payload = { ...valid, [field]: '' };
    expect(DemoRequestInputSchema.safeParse(payload).success).toBe(false);
  });
});

describe('PartnerInquiryInputSchema', () => {
  const base = {
    companyName: 'Example Transport Ltd',
    fleetSize: 40,
    contactName: 'Chidinma Eze',
  };

  it('accepts an email with no phone', () => {
    const result = PartnerInquiryInputSchema.safeParse({ ...base, contactEmail: 'c@example.com' });
    expect(result.success).toBe(true);
  });

  it('accepts a phone with no email', () => {
    const result = PartnerInquiryInputSchema.safeParse({ ...base, contactPhone: '+2348012345678' });
    expect(result.success).toBe(true);
  });

  it('rejects a submission with neither email nor phone', () => {
    // schema.md notes this rule is "enforced at the form/API layer, not
    // expressible in this schema alone" — in Zod it IS expressible, so it is
    // enforced centrally rather than re-implemented by each caller.
    const result = PartnerInquiryInputSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it('coerces a string fleet size, since number inputs yield strings', () => {
    const result = PartnerInquiryInputSchema.safeParse({
      ...base,
      fleetSize: '40',
      contactPhone: '+2348012345678',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fleetSize).toBe(40);
  });

  it('rejects a negative fleet size', () => {
    const result = PartnerInquiryInputSchema.safeParse({
      ...base,
      fleetSize: -1,
      contactPhone: '+2348012345678',
    });
    expect(result.success).toBe(false);
  });
});

describe('LeadPayloadSchema', () => {
  it('discriminates on leadType and validates the matching variant', () => {
    const result = LeadPayloadSchema.safeParse({
      ...envelope,
      leadType: 'waitlist',
      email: 'amaka@example.com',
    });
    expect(result.success).toBe(true);
  });

  it("rejects a payload whose fields don't match its declared leadType", () => {
    // Waitlist envelope carrying demo-request fields: exactly the shape a
    // spoofed or mis-wired client would produce.
    const result = LeadPayloadSchema.safeParse({
      ...envelope,
      leadType: 'waitlist',
      contactName: 'Tunde',
      workEmail: 'tunde@example.com',
      companyName: 'Example Bank',
    });
    expect(result.success).toBe(false);
  });

  it('requires the full envelope, not just the visitor-entered fields', () => {
    const result = LeadPayloadSchema.safeParse({ leadType: 'waitlist', email: 'a@example.com' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown lead type', () => {
    const result = LeadPayloadSchema.safeParse({ ...envelope, leadType: 'newsletter', email: 'a@b.com' });
    expect(result.success).toBe(false);
  });
});
