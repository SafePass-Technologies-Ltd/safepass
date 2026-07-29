import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoRequestForm, validateDemoRequest, NEEDS_DESCRIPTION_LIMIT } from './demo-request-form';
import * as leadClient from '@/lib/leads/client';

/**
 * FEAT-010 — Request a Demo Form.
 *
 * The five states from screens.md's Shared Form Error/Confirmation pattern are
 * the contract here. A corporate lead is the highest-value conversion on the
 * site, and risk_log.md R-004 scores a dropped one at Impact 5, so the error
 * and retry paths are tested as carefully as the happy path.
 */

const VALID = {
  contactName: 'Tunde Bakare',
  workEmail: 'tunde@examplebank.com',
  companyName: 'Example Bank',
};

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/your name/i), VALID.contactName);
  await user.type(screen.getByLabelText(/work email/i), VALID.workEmail);
  await user.type(screen.getByLabelText(/company name/i), VALID.companyName);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validateDemoRequest', () => {
  it('accepts the three required fields', () => {
    const result = validateDemoRequest({ ...VALID, teamSize: '', needsDescription: '' });
    expect(result.ok).toBe(true);
  });

  it.each(['contactName', 'workEmail', 'companyName'])('reports a missing %s', (field) => {
    const result = validateDemoRequest({ ...VALID, [field]: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[field]).toBeTruthy();
  });

  it('rejects a malformed work email', () => {
    const result = validateDemoRequest({ ...VALID, workEmail: 'tunde@' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.workEmail).toBeTruthy();
  });

  it('drops blank optionals rather than forwarding empty strings to the CRM', () => {
    const result = validateDemoRequest({ ...VALID, teamSize: '   ', needsDescription: '' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.teamSize).toBeUndefined();
      expect(result.input.needsDescription).toBeUndefined();
    }
  });

  it('flags over-long free text instead of silently truncating it', () => {
    const result = validateDemoRequest({
      ...VALID,
      needsDescription: 'x'.repeat(NEEDS_DESCRIPTION_LIMIT + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.needsDescription).toBeTruthy();
  });
});

describe('DemoRequestForm states', () => {
  it('renders the Default state with an enabled submit', () => {
    render(<DemoRequestForm />);
    expect(screen.getByRole('button', { name: /request a demo/i })).toBeEnabled();
  });

  it('links the Privacy Policy before submission (R-011)', () => {
    render(<DemoRequestForm />);
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/privacy');
  });

  it('shows inline Validation Errors without calling the network', async () => {
    const user = userEvent.setup();
    const submit = vi.spyOn(leadClient, 'submitLead');
    render(<DemoRequestForm />);

    await user.click(screen.getByRole('button', { name: /request a demo/i }));

    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    // user_flow.md's Global Flow: "client-side validation errors never reach
    // the network call".
    expect(submit).not.toHaveBeenCalled();
  });

  it('replaces the form with a Confirmed state stating next steps', async () => {
    const user = userEvent.setup();
    vi.spyOn(leadClient, 'submitLead').mockResolvedValue({ ok: true });
    render(<DemoRequestForm />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /request a demo/i }));

    // FEAT-010 AC3 — the confirmation must indicate expected response time or
    // next steps, never a blank refresh.
    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent(/working day/i);
    expect(screen.queryByLabelText(/work email/i)).not.toBeInTheDocument();
  });

  it('preserves entered data and offers Retry plus a fallback contact on delivery failure', async () => {
    const user = userEvent.setup();
    vi.spyOn(leadClient, 'submitLead').mockResolvedValue({
      ok: false,
      kind: 'delivery',
      message: 'Delivery failed',
    });
    render(<DemoRequestForm />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /request a demo/i }));

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    // A dropped lead is direct revenue loss — the visitor must never have to
    // retype, and must always have another route to us.
    expect(screen.getByLabelText(/work email/i)).toHaveValue(VALID.workEmail);
    expect(screen.getByRole('link', { name: /@/ })).toBeInTheDocument();
  });

  it('reuses one submissionId across a retry so a lead is never duplicated', async () => {
    const user = userEvent.setup();
    const submit = vi
      .spyOn(leadClient, 'submitLead')
      .mockResolvedValueOnce({ ok: false, kind: 'delivery', message: 'Delivery failed' })
      .mockResolvedValueOnce({ ok: true });

    render(<DemoRequestForm />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /request a demo/i }));
    await user.click(await screen.findByRole('button', { name: /retry/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    const [first] = submit.mock.calls[0];
    const [second] = submit.mock.calls[1];
    expect(second.submissionId).toBe(first.submissionId);
  });

  it('tags the submission with its lead type and source page for CRM triage', async () => {
    const user = userEvent.setup();
    const submit = vi.spyOn(leadClient, 'submitLead').mockResolvedValue({ ok: true });

    render(<DemoRequestForm />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /request a demo/i }));

    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0]).toMatchObject({
      leadType: 'demo_request',
      sourcePage: '/business',
    });
  });
});
