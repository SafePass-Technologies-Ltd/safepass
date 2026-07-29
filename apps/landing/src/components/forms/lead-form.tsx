'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { LeadType } from '@safepass/shared';
import { Button } from '@/components/ui/button';
import { clientEnv } from '@/lib/env';
import { createSubmissionId, submitLead, type LeadInput } from '@/lib/leads/client';
import { cn } from '@/lib/utils';

/**
 * Shared lead-form shell — FEAT-012.
 *
 * ONE SHELL, THREE VARIANTS. FEAT-012's second acceptance criterion is that
 * all three lead types "submit into a single, consistent lead-delivery
 * mechanism", and screens.md defines one Shared Form Error/Confirmation
 * pattern across them. This component owns that state machine — the five
 * states, validation, submission, retry — and a variant supplies only its
 * field set and its copy. FEAT-010 (demo request) and FEAT-008 (waitlist) are
 * meant to be `<LeadForm>` calls, not forks of it.
 *
 * The five states, verbatim from screens.md:
 *  - Default          — empty fields, Submit in `primary`, enabled
 *  - Validation Error — inline error text beneath each offending field; form
 *                       stays fully editable
 *  - Submitting       — spinner in the button, all fields non-editable, so a
 *                       double-submit is impossible
 *  - Submission Error — banner, entered data fully preserved, visible Retry,
 *                       and a fallback contact method
 *  - Confirmed        — the form is replaced entirely by a message stating
 *                       next steps; never a blank refresh
 */

export type LeadFormValues = Record<string, string>;
export type LeadFormErrors = Record<string, string>;

/** Outcome of a variant's client-side validation pass. */
export type LeadValidationResult<TInput extends LeadInput> =
  | { ok: true; input: TInput }
  | { ok: false; errors: LeadFormErrors };

/** What the render-prop hands a variant so it can draw its fields. */
export interface LeadFormFieldApi {
  values: LeadFormValues;
  errors: LeadFormErrors;
  /** True while a submission is in flight — bind to every field's `disabled`. */
  disabled: boolean;
  setValue: (name: string, value: string) => void;
  error: (name: string) => string | undefined;
}

interface LeadFormProps<TInput extends LeadInput> {
  leadType: LeadType;
  /** Canonical path this form lives on, forwarded for CRM triage. */
  sourcePage: string;
  initialValues: LeadFormValues;
  /**
   * Client-side validation, run before ANY network call.
   *
   * user_flow.md's Global Flow is explicit that "client-side validation errors
   * never reach the network call". Variants implement this with the shared Zod
   * schema from `@safepass/shared` rather than hand-rolled checks, so the
   * browser and the Lead Intake Service enforce the same contract.
   */
  validate: (values: LeadFormValues) => LeadValidationResult<TInput>;
  submitLabel: string;
  submittingLabel?: string;
  confirmation: { heading: string; body: string[] };
  /** Accessible name for the form region. */
  ariaLabel: string;
  children: (field: LeadFormFieldApi) => ReactNode;
  className?: string;
}

type Status = 'default' | 'submitting' | 'error' | 'confirmed';

export function LeadForm<TInput extends LeadInput>({
  leadType,
  sourcePage,
  initialValues,
  validate,
  submitLabel,
  submittingLabel = 'Sending…',
  confirmation,
  ariaLabel,
  children,
  className,
}: LeadFormProps<TInput>) {
  const [values, setValues] = useState<LeadFormValues>(initialValues);
  const [errors, setErrors] = useState<LeadFormErrors>({});
  const [status, setStatus] = useState<Status>('default');
  const [deliveryMessage, setDeliveryMessage] = useState<string>('');

  /**
   * ONE submission id per form fill, reused across every retry attempt.
   *
   * The backend deduplicates on this value. Regenerating it per attempt would
   * turn an ambiguous timeout followed by a retry into two leads for sales to
   * chase twice — which is why it lives in a ref cleared only on success, not
   * in the submit handler.
   */
  const submissionIdRef = useRef<string | null>(null);

  const confirmationRef = useRef<HTMLDivElement>(null);

  // Move focus to the confirmation once the form it replaced is gone, so a
  // screen reader user isn't left focused on a button that no longer exists.
  useEffect(() => {
    if (status === 'confirmed') confirmationRef.current?.focus();
  }, [status]);

  const submitting = status === 'submitting';

  function setValue(name: string, value: string) {
    setValues((previous) => ({ ...previous, [name]: value }));
    // Clearing the field's error as it is edited is what keeps the Validation
    // Error state "fully editable" rather than nagging while the user types.
    setErrors((previous) => {
      if (!(name in previous)) return previous;
      const next = { ...previous };
      delete next[name];
      return next;
    });
  }

  async function send() {
    const result = validate(values);

    if (!result.ok) {
      setErrors(result.errors);
      setStatus('default');
      return;
    }

    setErrors({});
    setStatus('submitting');

    submissionIdRef.current ??= createSubmissionId();

    const response = await submitLead({
      leadType,
      sourcePage,
      input: result.input,
      submissionId: submissionIdRef.current,
    });

    if (response.ok) {
      // Only now is the id spent: the lead landed, so a subsequent fill is a
      // genuinely new submission.
      submissionIdRef.current = null;
      setStatus('confirmed');
      return;
    }

    if (response.kind === 'validation') {
      // The service found something the client schema didn't. Surface it
      // inline and return to an editable form rather than showing a delivery
      // banner the visitor can only retry into the same rejection.
      setErrors(
        Object.fromEntries(
          Object.entries(response.fields).map(([field, messages]) => [field, messages[0] ?? 'Invalid value'])
        )
      );
      setStatus('default');
      return;
    }

    setDeliveryMessage(response.message);
    setStatus('error');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    void send();
  }

  if (status === 'confirmed') {
    return (
      <div
        ref={confirmationRef}
        tabIndex={-1}
        role="status"
        className={cn(
          'flex flex-col gap-sm rounded-lg border border-success/30 bg-success/10 p-lg',
          className
        )}
        data-form-state="confirmed"
      >
        <CircleCheck className="text-success" size={28} aria-hidden="true" />
        <h3 className="text-h3 text-text-primary">{confirmation.heading}</h3>
        {confirmation.body.map((paragraph) => (
          <p key={paragraph} className="text-body text-text-secondary">
            {paragraph}
          </p>
        ))}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={ariaLabel}
      noValidate
      className={cn('flex flex-col gap-lg', className)}
      data-form-state={status}
    >
      {status === 'error' && (
        <div
          role="alert"
          className="flex flex-col gap-sm rounded-md border border-error/40 bg-surface-secondary p-md"
        >
          <p className="flex items-center gap-sm text-body font-semibold text-error">
            <TriangleAlert size={18} aria-hidden="true" />
            We couldn&apos;t send your details
          </p>
          <p className="text-body text-text-secondary">{deliveryMessage}</p>
          <p className="text-body text-text-secondary">
            Nothing you typed has been lost — press Retry to try again. If it keeps failing, email us
            directly at{' '}
            <a
              href={`mailto:${clientEnv.fallbackContactEmail}`}
              className="font-medium text-accent-text hover:underline"
            >
              {clientEnv.fallbackContactEmail}
            </a>
            .
          </p>
          <Button type="submit" variant="secondary" className="self-start">
            Retry
          </Button>
        </div>
      )}

      {/* `fieldset[disabled]` makes every control inside non-editable in one
          place, which is what actually prevents a double-submit — disabling
          only the button would still let Enter resubmit from a text field. */}
      <fieldset disabled={submitting} className="flex min-w-0 flex-col gap-lg border-0 p-0">
        {children({
          values,
          errors,
          disabled: submitting,
          setValue,
          error: (name) => errors[name],
        })}
      </fieldset>

      {/* R-011: the Privacy Policy is linked before submission, not after. */}
      <p className="text-body-small text-text-secondary">
        By submitting this form you agree to how we handle your details, described in our{' '}
        <Link href="/privacy" className="font-medium text-accent-text underline hover:underline">
          Privacy Policy
        </Link>
        .
      </p>

      <Button type="submit" className="self-start" aria-busy={submitting || undefined}>
        {submitting ? (
          <>
            <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
            {submittingLabel}
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  );
}
