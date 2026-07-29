'use client';

import { PartnerInquiryInputSchema, type PartnerInquiryInput } from '@safepass/shared';
import { Input, Textarea } from '@/components/ui/input';
import { LeadForm, type LeadFormErrors, type LeadFormValues, type LeadValidationResult } from './lead-form';

/**
 * Partner Inquiry Form — FEAT-012, `screens/04-transport-partner-audience-page.md`.
 *
 * A thin variant over the shared `LeadForm` shell: field set plus copy, no
 * state machine of its own. Validation is the shared Zod schema from
 * `@safepass/shared`, so the browser enforces exactly the contract the Lead
 * Intake Service and the SafePass backend enforce — including the cross-field
 * rule that at least one of email or phone is present.
 */

const INITIAL_VALUES: LeadFormValues = {
  companyName: '',
  fleetSize: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  message: '',
};

/**
 * Validates the raw string values against `PartnerInquiryInputSchema`.
 *
 * Exported for tests: the field-level messages a visitor sees are worth
 * asserting directly, not only through the rendered form.
 */
export function validatePartnerInquiry(
  values: LeadFormValues
): LeadValidationResult<PartnerInquiryInput> {
  const trimmed = (name: string) => (values[name] ?? '').trim();

  // Blank fleet size is handled outside the schema because `z.coerce.number`
  // turns '' into 0 — a silently valid "fleet of zero" would pass validation
  // and reach the CRM as a real answer, which is worse than a field error.
  // Merged with the schema's errors rather than short-circuiting, so the
  // visitor sees every problem on the form at once instead of one per submit.
  const fleetSizeMissing = trimmed('fleetSize') === '';

  const result = PartnerInquiryInputSchema.safeParse({
    companyName: trimmed('companyName'),
    fleetSize: trimmed('fleetSize'),
    contactName: trimmed('contactName'),
    contactEmail: trimmed('contactEmail'),
    // Empty optionals are dropped rather than forwarded as '' — the CRM should
    // see an absent field, not a blank one.
    contactPhone: trimmed('contactPhone') || undefined,
    message: trimmed('message') || undefined,
  });

  if (result.success && !fleetSizeMissing) return { ok: true, input: result.data };

  const errors: LeadFormErrors = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? 'form');
      // First message per field wins — a field showing two stacked errors reads
      // as a broken form rather than a correction to make.
      errors[field] ??= issue.message;
    }
  }
  if (fleetSizeMissing) errors.fleetSize = 'Fleet size is required';

  return { ok: false, errors };
}

export function PartnerInquiryForm({ sourcePage = '/transport-partners' }: { sourcePage?: string }) {
  return (
    <LeadForm<PartnerInquiryInput>
      leadType="partner_inquiry"
      sourcePage={sourcePage}
      initialValues={INITIAL_VALUES}
      validate={validatePartnerInquiry}
      // "Talk to Us", not "Get Pricing" — screens/04's Interactive Behavior is
      // explicit that the CTA must not promise a number the page doesn't give.
      submitLabel="Talk to Us"
      ariaLabel="Partner inquiry"
      confirmation={{
        heading: 'Thanks — your inquiry is with our partnerships team',
        body: [
          'Someone from SafePass will get in touch using the contact details you gave us to talk through fleet onboarding, costs, and what monitoring would look like for your vehicles.',
          'If you need to reach us before then, reply to any SafePass email or use the contact details on this site.',
        ],
      }}
    >
      {({ values, setValue, error, disabled }) => (
        <>
          <Input
            label="Company name"
            name="companyName"
            value={values.companyName}
            onChange={(event) => setValue('companyName', event.target.value)}
            error={error('companyName')}
            disabled={disabled}
            autoComplete="organization"
          />

          <Input
            label="Approximate fleet size"
            name="fleetSize"
            type="number"
            inputMode="numeric"
            min={0}
            value={values.fleetSize}
            onChange={(event) => setValue('fleetSize', event.target.value)}
            error={error('fleetSize')}
            hint="A rough number is fine — we only use it to size the conversation."
            disabled={disabled}
          />

          <Input
            label="Your name"
            name="contactName"
            value={values.contactName}
            onChange={(event) => setValue('contactName', event.target.value)}
            error={error('contactName')}
            disabled={disabled}
            autoComplete="name"
          />

          <Input
            label="Work email"
            name="contactEmail"
            type="email"
            value={values.contactEmail}
            onChange={(event) => setValue('contactEmail', event.target.value)}
            error={error('contactEmail')}
            hint="Give us an email or a phone number — whichever you'd rather we used."
            disabled={disabled}
            autoComplete="email"
          />

          <Input
            label="Phone"
            name="contactPhone"
            type="tel"
            optional
            value={values.contactPhone}
            onChange={(event) => setValue('contactPhone', event.target.value)}
            error={error('contactPhone')}
            disabled={disabled}
            autoComplete="tel"
          />

          <Textarea
            label="Anything you'd like us to know"
            name="message"
            optional
            value={values.message}
            onChange={(event) => setValue('message', event.target.value)}
            error={error('message')}
            disabled={disabled}
          />
        </>
      )}
    </LeadForm>
  );
}
