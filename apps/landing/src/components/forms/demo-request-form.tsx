'use client';

import { DemoRequestInputSchema, type DemoRequestInput } from '@safepass/shared';
import { Input, Textarea } from '@/components/ui/input';
import { LeadForm, type LeadFormErrors, type LeadFormValues, type LeadValidationResult } from './lead-form';

/**
 * Request a Demo Form — FEAT-010, `screens/03-corporate-audience-page.md`.
 *
 * A variant over the shared `LeadForm` shell, exactly as the partner-inquiry
 * form is: field set and copy only, no state machine of its own. FEAT-010's
 * fourth acceptance criterion requires this route through FEAT-012's single
 * lead-delivery mechanism, which is what using the shell guarantees rather
 * than merely intends.
 */

const INITIAL_VALUES: LeadFormValues = {
  contactName: '',
  workEmail: '',
  companyName: '',
  teamSize: '',
  needsDescription: '',
};

/** Soft limit on the free-text field, per screens/03's edge case. */
export const NEEDS_DESCRIPTION_LIMIT = 1000;

/**
 * Validates raw string values against `DemoRequestInputSchema`.
 *
 * Exported for tests: the messages a visitor actually sees are worth asserting
 * directly, not only through the rendered form.
 */
export function validateDemoRequest(values: LeadFormValues): LeadValidationResult<DemoRequestInput> {
  const trimmed = (name: string) => (values[name] ?? '').trim();

  const result = DemoRequestInputSchema.safeParse({
    contactName: trimmed('contactName'),
    workEmail: trimmed('workEmail'),
    companyName: trimmed('companyName'),
    // Empty optionals are dropped rather than forwarded as '' — the CRM should
    // see an absent field, not a blank one.
    teamSize: trimmed('teamSize') || undefined,
    needsDescription: trimmed('needsDescription') || undefined,
  });

  const errors: LeadFormErrors = {};

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? 'form');
      // First message per field wins — stacked errors read as a broken form
      // rather than a correction to make.
      errors[field] ??= issue.message;
    }
  }

  // Enforced here rather than in the shared schema: the limit is a UI affordance
  // (screens/03 asks for "a soft character limit with visible counter"), not
  // part of the data contract the backend enforces.
  if (trimmed('needsDescription').length > NEEDS_DESCRIPTION_LIMIT) {
    errors.needsDescription = `Please keep this under ${NEEDS_DESCRIPTION_LIMIT.toLocaleString('en-NG')} characters`;
  }

  if (result.success && Object.keys(errors).length === 0) {
    return { ok: true, input: result.data };
  }

  return { ok: false, errors };
}

export function DemoRequestForm({ sourcePage = '/business' }: { sourcePage?: string }) {
  return (
    <LeadForm<DemoRequestInput>
      leadType="demo_request"
      sourcePage={sourcePage}
      initialValues={INITIAL_VALUES}
      validate={validateDemoRequest}
      submitLabel="Request a Demo"
      ariaLabel="Request a demo"
      confirmation={{
        heading: 'Thanks — your demo request is in',
        body: [
          // FEAT-010 AC3 requires the confirmation state indicate expected
          // response time or next steps. "One working day" is a service
          // commitment, not a product claim, and is stated as an intent rather
          // than a guarantee since no SLA is documented anywhere.
          'A member of the SafePass team will follow up by email, normally within one working day, to arrange a walkthrough suited to how your organisation travels.',
          'If your request is urgent, reply to the confirmation email and we will prioritise it.',
        ],
      }}
    >
      {({ values, setValue, error, disabled }) => (
        <>
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
            name="workEmail"
            type="email"
            value={values.workEmail}
            onChange={(event) => setValue('workEmail', event.target.value)}
            error={error('workEmail')}
            disabled={disabled}
            autoComplete="email"
          />

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
            label="How many people travel for work?"
            name="teamSize"
            optional
            value={values.teamSize}
            onChange={(event) => setValue('teamSize', event.target.value)}
            error={error('teamSize')}
            hint="A rough figure is fine — for example, “50-200 field staff”."
            disabled={disabled}
          />

          <div className="flex flex-col gap-xs">
            <Textarea
              label="What are you trying to solve?"
              name="needsDescription"
              optional
              rows={5}
              value={values.needsDescription}
              onChange={(event) => setValue('needsDescription', event.target.value)}
              error={error('needsDescription')}
              disabled={disabled}
            />
            {/* Visible counter, soft limit — screens/03 is explicit that long
                input must not be silently truncated. */}
            <p
              className="self-end text-body-small text-text-secondary"
              aria-live="polite"
            >
              {(values.needsDescription ?? '').length.toLocaleString('en-NG')} /{' '}
              {NEEDS_DESCRIPTION_LIMIT.toLocaleString('en-NG')}
            </p>
          </div>
        </>
      )}
    </LeadForm>
  );
}
