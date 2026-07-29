import { z } from 'zod';

/**
 * SafePassLanding lead-capture contracts.
 *
 * Mirrors `docs/SafePassLanding/schema.md`. These are *data contracts*, not
 * database entities from the landing site's perspective: SafePassLanding
 * persists none of them (see that doc's Overview and `architecture.md`'s
 * "SafePassLanding intentionally has no primary database"). The site's Lead
 * Intake Service validates and forwards; the SafePass backend is the system
 * of record and assigns its own durable identifiers on receipt.
 *
 * Two schema families live here:
 *
 *  - `*InputSchema` — the fields a *visitor* fills in on a form. Used for
 *    client-side validation and as the request body the browser POSTs to the
 *    landing site's own `/api/leads` route.
 *  - `*Schema` / `LeadPayloadSchema` — the input plus the envelope fields the
 *    Lead Intake Service attaches (`submissionId`, `leadType`, `sourcePage`,
 *    `submittedAt`). This is what crosses the boundary to the SafePass
 *    backend's `POST /v1/leads`.
 *
 * Splitting them matters: the envelope is server-attached, so a client must
 * never be able to spoof `leadType` or backdate `submittedAt`.
 */

// -----------------------------------------------------------------------------
// Base envelope
// -----------------------------------------------------------------------------

/**
 * Lead category, used by the SafePass backend/CRM to route the submission
 * into the correct pipeline. Values are fixed by schema.md's enum.
 */
export const LeadTypeEnum = z.enum(['waitlist', 'demo_request', 'partner_inquiry']);

/**
 * Fields the Lead Intake Service attaches to *every* lead payload before
 * forwarding, regardless of type (schema.md → `LeadSubmission`).
 */
export const LeadSubmissionBaseSchema = z.object({
  /**
   * Client-generated identifier for this submission attempt, used for
   * delivery logging and retry correlation. Deliberately NOT a durable record
   * ID — it exists so a retried submission can be recognised as the same
   * attempt rather than counted twice.
   */
  submissionId: z.string().uuid(),
  leadType: LeadTypeEnum,
  /** Canonical path the submission originated from, e.g. '/business'. */
  sourcePage: z.string().min(1),
  submittedAt: z.string().datetime(),
});

// -----------------------------------------------------------------------------
// Waitlist (FEAT-008 — Individual Traveller Page)
// -----------------------------------------------------------------------------

export const WaitlistSignupInputSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  phone: z.string().optional(),
  cityOrRegion: z.string().optional(),
});

export const WaitlistSignupSchema = LeadSubmissionBaseSchema.extend({
  leadType: z.literal('waitlist'),
}).merge(WaitlistSignupInputSchema);

// -----------------------------------------------------------------------------
// Demo request (FEAT-010 — Corporate Audience Page)
// -----------------------------------------------------------------------------

export const DemoRequestInputSchema = z.object({
  contactName: z.string().min(1, 'Name is required'),
  workEmail: z.string().min(1, 'Work email is required').email('Enter a valid work email address'),
  companyName: z.string().min(1, 'Company name is required'),
  teamSize: z.string().optional(),
  needsDescription: z.string().optional(),
});

export const DemoRequestSchema = LeadSubmissionBaseSchema.extend({
  leadType: z.literal('demo_request'),
}).merge(DemoRequestInputSchema);

// -----------------------------------------------------------------------------
// Partner inquiry (FEAT-012 — Transport Partner Audience Page)
// -----------------------------------------------------------------------------

/**
 * Note the cross-field rule: schema.md marks both `contactEmail` and
 * `contactPhone` as individually optional but records that "at least one of
 * contactEmail or contactPhone is required (enforced at the form/API layer,
 * not expressible in this schema alone)". JSON Schema couldn't express it;
 * Zod can, so it's enforced here via `.refine` rather than left to each
 * caller to remember.
 */
export const PartnerInquiryInputSchema = z
  .object({
    companyName: z.string().min(1, 'Company name is required'),
    fleetSize: z.coerce
      .number({ invalid_type_error: 'Enter a number' })
      .int('Enter a whole number')
      .min(0, 'Fleet size cannot be negative'),
    contactName: z.string().min(1, 'Contact name is required'),
    contactEmail: z.string().email('Enter a valid email address').optional().or(z.literal('')),
    contactPhone: z.string().optional(),
    message: z.string().optional(),
  })
  .refine((data) => Boolean(data.contactEmail) || Boolean(data.contactPhone), {
    message: 'Provide an email address or a phone number so we can reach you',
    path: ['contactEmail'],
  });

/**
 * Object form of the partner-inquiry fields, without the `.refine` wrapper.
 *
 * `ZodEffects` (what `.refine` returns) has no `.merge`/`.extend`, so the
 * envelope is composed onto this raw object and the cross-field rule is
 * re-applied afterwards. Keeping both avoids duplicating the field list.
 */
const partnerInquiryFields = PartnerInquiryInputSchema.innerType();

export const PartnerInquirySchema = LeadSubmissionBaseSchema.extend({
  leadType: z.literal('partner_inquiry'),
})
  .merge(partnerInquiryFields)
  .refine((data) => Boolean(data.contactEmail) || Boolean(data.contactPhone), {
    message: 'Provide an email address or a phone number so we can reach you',
    path: ['contactEmail'],
  });

// -----------------------------------------------------------------------------
// Discriminated payload union
// -----------------------------------------------------------------------------

/**
 * The full set of payload shapes accepted by the SafePass backend's lead
 * intake endpoint. Discriminated on `leadType` so a malformed or mismatched
 * payload fails validation at the boundary rather than reaching the CRM.
 */
export const LeadPayloadSchema = z.discriminatedUnion('leadType', [
  LeadSubmissionBaseSchema.extend({ leadType: z.literal('waitlist') }).merge(WaitlistSignupInputSchema),
  LeadSubmissionBaseSchema.extend({ leadType: z.literal('demo_request') }).merge(DemoRequestInputSchema),
  LeadSubmissionBaseSchema.extend({ leadType: z.literal('partner_inquiry') }).merge(partnerInquiryFields),
]);

// -----------------------------------------------------------------------------
// Inferred types
// -----------------------------------------------------------------------------

export type LeadType = z.infer<typeof LeadTypeEnum>;
export type LeadSubmissionBase = z.infer<typeof LeadSubmissionBaseSchema>;

export type WaitlistSignupInput = z.infer<typeof WaitlistSignupInputSchema>;
export type WaitlistSignup = z.infer<typeof WaitlistSignupSchema>;

export type DemoRequestInput = z.infer<typeof DemoRequestInputSchema>;
export type DemoRequest = z.infer<typeof DemoRequestSchema>;

export type PartnerInquiryInput = z.infer<typeof PartnerInquiryInputSchema>;
export type PartnerInquiry = z.infer<typeof PartnerInquirySchema>;

export type LeadPayload = z.infer<typeof LeadPayloadSchema>;
