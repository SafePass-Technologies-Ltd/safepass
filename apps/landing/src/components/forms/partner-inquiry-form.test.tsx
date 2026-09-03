import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LeadSubmitResult } from '@/lib/leads/client';

/**
 * FEAT-012 — Partner Inquiry Form, and the five states of screens.md's Shared
 * Form Error/Confirmation Pattern.
 *
 * The lead-delivery transport is mocked, not the state machine: what these
 * tests are actually protecting is that a delivery failure never loses a lead
 * (R-004, Impact 5) — preserved data, a visible retry, a fallback address, and
 * one submission id reused across retries so the retry can't produce a second
 * lead in the CRM.
 */

const submitLead = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<LeadSubmitResult>>());
const createSubmissionId = vi.hoisted(() => vi.fn(() => 'fixed-submission-id'));

vi.mock('@/lib/leads/client', () => ({ submitLead, createSubmissionId }));

const { PartnerInquiryForm, validatePartnerInquiry } = await import('./partner-inquiry-form');

/** Fills the required fields with a valid inquiry. */
async function fillValidInquiry(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/company name/i), 'Chidi Transit Ltd');
  await user.type(screen.getByLabelText(/fleet size/i), '24');
  await user.type(screen.getByLabelText(/your name/i), 'Chidinma Eze');
  await user.type(screen.getByLabelText(/work email/i), 'chidinma@chiditransit.ng');
}

function submitButton() {
  return screen.getByRole('button', { name: /talk to us/i });
}

/** The submit button regardless of state — its label becomes "Sending…" in flight. */
function submitControl(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('form > button[type="submit"]');
  if (!button) throw new Error('No submit button rendered');
  return button;
}

beforeEach(() => {
  submitLead.mockReset();
  createSubmissionId.mockClear();
  createSubmissionId.mockReturnValue('fixed-submission-id');
});

describe('PartnerInquiryForm — Default state', () => {
  it('renders every documented field, empty, with the submit enabled', () => {
    render(<PartnerInquiryForm />);

    for (const label of [/company name/i, /fleet size/i, /your name/i, /work email/i, /phone/i]) {
      // `toHaveDisplayValue` rather than `toHaveValue`: the fleet-size field is
      // a number input, whose `value` reads back as null when empty.
      expect(screen.getByLabelText(label)).toHaveDisplayValue('');
    }
    // The client-requested "current challenges" select is present and unticked.
    expect(screen.getByLabelText(/what challenges are you facing/i)).toHaveDisplayValue(
      /choose one/i
    );
    expect(submitButton()).toBeEnabled();
  });

  it('labels the submit "Talk to Us", not a pricing promise', () => {
    render(<PartnerInquiryForm />);
    expect(screen.queryByRole('button', { name: /pricing/i })).toBeNull();
    expect(submitButton()).toBeInTheDocument();
  });

  it('links the live Privacy Policy before submission (R-011)', () => {
    render(<PartnerInquiryForm />);
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/privacy');
  });
});

describe('PartnerInquiryForm — Validation Error state', () => {
  it('shows inline errors and never reaches the network', async () => {
    const user = userEvent.setup();
    render(<PartnerInquiryForm />);

    await user.click(submitButton());

    expect(await screen.findByText(/company name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/fleet size is required/i)).toBeInTheDocument();
    expect(submitLead).not.toHaveBeenCalled();
  });

  it('leaves the form fully editable after a validation error', async () => {
    const user = userEvent.setup();
    render(<PartnerInquiryForm />);

    await user.click(submitButton());
    await screen.findByText(/company name is required/i);

    await user.type(screen.getByLabelText(/company name/i), 'Chidi Transit Ltd');
    expect(screen.getByLabelText(/company name/i)).toHaveValue('Chidi Transit Ltd');
    // The error clears as the field is corrected rather than nagging.
    expect(screen.queryByText(/company name is required/i)).toBeNull();
  });

  it('requires an email or a phone number', () => {
    const result = validatePartnerInquiry({
      companyName: 'Chidi Transit Ltd',
      fleetSize: '24',
      contactName: 'Chidinma Eze',
      contactEmail: '',
      contactPhone: '',
      message: '',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.contactEmail).toMatch(/email address or a phone number/i);
  });

  it('accepts a phone number with no email', () => {
    const result = validatePartnerInquiry({
      companyName: 'Chidi Transit Ltd',
      fleetSize: '24',
      contactName: 'Chidinma Eze',
      contactEmail: '',
      contactPhone: '+2348030000000',
      message: '',
    });

    expect(result.ok).toBe(true);
  });

  it('passes a selected current challenge through to the payload', () => {
    const result = validatePartnerInquiry({
      companyName: 'Chidi Transit Ltd',
      fleetSize: '24',
      contactName: 'Chidinma Eze',
      contactEmail: 'chidinma@chiditransit.ng',
      contactPhone: '',
      currentChallenges: 'brand_differentiation',
      message: '',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.currentChallenges).toBe('brand_differentiation');
  });

  it('flags a negative fleet size but accepts zero (screens/04 edge case)', () => {
    const base = {
      companyName: 'Chidi Transit Ltd',
      contactName: 'Chidinma Eze',
      contactEmail: 'chidinma@chiditransit.ng',
      contactPhone: '',
      message: '',
    };

    const negative = validatePartnerInquiry({ ...base, fleetSize: '-3' });
    expect(negative.ok).toBe(false);
    if (!negative.ok) expect(negative.errors.fleetSize).toMatch(/negative/i);

    expect(validatePartnerInquiry({ ...base, fleetSize: '0' }).ok).toBe(true);
    expect(validatePartnerInquiry({ ...base, fleetSize: '5000' }).ok).toBe(true);
  });

  it('treats a blank fleet size as missing, not as a fleet of zero', () => {
    const result = validatePartnerInquiry({
      companyName: 'Chidi Transit Ltd',
      fleetSize: '   ',
      contactName: 'Chidinma Eze',
      contactEmail: 'chidinma@chiditransit.ng',
      contactPhone: '',
      message: '',
    });

    expect(result.ok).toBe(false);
  });
});

describe('PartnerInquiryForm — Submitting state', () => {
  it('disables every field and shows a spinner while in flight', async () => {
    const user = userEvent.setup();
    let resolve: (value: LeadSubmitResult) => void = () => {};
    submitLead.mockReturnValue(new Promise<LeadSubmitResult>((r) => (resolve = r)));

    render(<PartnerInquiryForm />);
    await fillValidInquiry(user);
    await user.click(submitButton());

    await waitFor(() => expect(submitControl()).toHaveAttribute('aria-busy', 'true'));
    expect(screen.getByLabelText(/company name/i)).toBeDisabled();
    expect(screen.getByLabelText(/work email/i)).toBeDisabled();

    resolve({ ok: true });
    await screen.findByRole('status');
  });

  it('cannot double-submit', async () => {
    const user = userEvent.setup();
    let resolve: (value: LeadSubmitResult) => void = () => {};
    submitLead.mockReturnValue(new Promise<LeadSubmitResult>((r) => (resolve = r)));

    render(<PartnerInquiryForm />);
    await fillValidInquiry(user);
    await user.click(submitButton());
    await waitFor(() => expect(submitControl()).toHaveAttribute('aria-busy', 'true'));

    await user.click(submitControl());
    expect(submitLead).toHaveBeenCalledTimes(1);

    resolve({ ok: true });
    await screen.findByRole('status');
  });
});

describe('PartnerInquiryForm — Submission Error state (R-004)', () => {
  it('shows a banner, preserves entered data, and offers retry plus a fallback contact', async () => {
    const user = userEvent.setup();
    submitLead.mockResolvedValue({ ok: false, kind: 'delivery', message: 'Delivery failed.' });

    render(<PartnerInquiryForm />);
    await fillValidInquiry(user);
    await user.click(submitButton());

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent(/delivery failed/i);

    // Nothing cleared.
    expect(screen.getByLabelText(/company name/i)).toHaveValue('Chidi Transit Ltd');
    expect(screen.getByLabelText(/work email/i)).toHaveValue('chidinma@chiditransit.ng');

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    const fallback = screen.getByRole('link', { name: /@/ });
    expect(fallback.getAttribute('href')).toMatch(/^mailto:/);
  });

  it('reuses one submission id across retries, so a retry cannot create a second lead', async () => {
    const user = userEvent.setup();
    submitLead.mockResolvedValue({ ok: false, kind: 'delivery', message: 'Delivery failed.' });

    render(<PartnerInquiryForm />);
    await fillValidInquiry(user);
    await user.click(submitButton());
    await screen.findByRole('alert');

    submitLead.mockResolvedValue({ ok: true });
    await user.click(screen.getByRole('button', { name: /retry/i }));
    await screen.findByRole('status');

    expect(submitLead).toHaveBeenCalledTimes(2);
    expect(createSubmissionId).toHaveBeenCalledTimes(1);
    const ids = submitLead.mock.calls.map((call) => (call[0] as { submissionId: string }).submissionId);
    expect(ids[0]).toBe(ids[1]);
  });

  it('surfaces service-side field errors inline rather than as a delivery banner', async () => {
    const user = userEvent.setup();
    submitLead.mockResolvedValue({
      ok: false,
      kind: 'validation',
      fields: { contactEmail: ['Enter a valid email address'] },
    });

    render(<PartnerInquiryForm />);
    await fillValidInquiry(user);
    await user.click(submitButton());

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });
});

describe('PartnerInquiryForm — Confirmed state', () => {
  it('replaces the form entirely with next steps', async () => {
    const user = userEvent.setup();
    submitLead.mockResolvedValue({ ok: true });

    render(<PartnerInquiryForm />);
    await fillValidInquiry(user);
    await user.click(submitButton());

    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent(/partnerships team/i);
    expect(confirmation).toHaveTextContent(/get in touch/i);

    // The form is gone, not merely reset — screens.md: "never a blank refresh".
    expect(screen.queryByLabelText(/company name/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /talk to us/i })).toBeNull();
  });

  it('tags the submission by lead type and source page for CRM triage', async () => {
    const user = userEvent.setup();
    submitLead.mockResolvedValue({ ok: true });

    render(<PartnerInquiryForm sourcePage="/transport-partners" />);
    await fillValidInquiry(user);
    await user.click(submitButton());
    await screen.findByRole('status');

    expect(submitLead).toHaveBeenCalledWith(
      expect.objectContaining({ leadType: 'partner_inquiry', sourcePage: '/transport-partners' })
    );
  });
});
