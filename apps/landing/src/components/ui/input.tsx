'use client';

import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Form field primitives — branding.md Section 3.5's Inputs table.
 *
 * Every field is rendered with a real, associated <label> and, when invalid,
 * `aria-invalid` plus an `aria-describedby` pointing at the error text.
 * FEAT-008's acceptance criteria require the forms be "accessible via keyboard
 * and screen reader (labeled inputs, visible focus states)", and since all
 * three lead forms are the site's conversion mechanism, an unlabelled field is
 * a lost lead, not just an audit finding.
 */

const FIELD_BASE = cn(
  'w-full rounded-md border bg-surface-secondary px-md text-body text-text-primary',
  'placeholder:text-text-secondary/70',
  'transition-colors duration-[var(--duration-instant)]',
  'disabled:opacity-50 disabled:cursor-not-allowed'
);

/** Focus state pairs the primary border with a softened glow, per 3.5. */
const FIELD_STATE = {
  default: 'border-border focus:border-primary focus:bg-surface',
  error: 'border-error bg-surface',
} as const;

interface FieldProps {
  label: string;
  error?: string;
  /** Helper text shown beneath the field when there's no error. */
  hint?: string;
  /** Appends a visible "(optional)" marker — clearer than marking required fields. */
  optional?: boolean;
}

export function Input({
  label,
  error,
  hint,
  optional = false,
  className,
  id: providedId,
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-xs">
      <label htmlFor={id} className="text-body font-medium text-text-primary">
        {label}
        {optional && <span className="ml-xs text-text-secondary font-normal">(optional)</span>}
      </label>

      <input
        id={id}
        className={cn(
          FIELD_BASE,
          'h-(--size-input-height)',
          error ? FIELD_STATE.error : FIELD_STATE.default,
          className
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        {...props}
      />

      {error ? (
        <p id={errorId} role="alert" className="text-body-small text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-body-small text-text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Textarea({
  label,
  error,
  hint,
  optional = false,
  className,
  id: providedId,
  rows = 4,
  ...props
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-xs">
      <label htmlFor={id} className="text-body font-medium text-text-primary">
        {label}
        {optional && <span className="ml-xs text-text-secondary font-normal">(optional)</span>}
      </label>

      <textarea
        id={id}
        rows={rows}
        className={cn(FIELD_BASE, 'py-sm', error ? FIELD_STATE.error : FIELD_STATE.default, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        {...props}
      />

      {error ? (
        <p id={errorId} role="alert" className="text-body-small text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-body-small text-text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
