import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AudienceProvider, useAudience, AUDIENCE_CONFIG } from './audience-context';

/**
 * Foundation tests for audience state (FEAT-001).
 *
 * Covers the two behaviours user_flow.md's "Audience Selector Persistence"
 * global flow specifies, both of which are mitigations for R-001/R-002 rather
 * than conveniences: selection survives navigation within a session, and a
 * deep link sets the audience to match the page instead of defaulting to
 * Individual.
 */

const mockPathname = vi.hoisted(() => ({ value: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
}));

function Probe() {
  const { audience, setAudience } = useAudience();
  return (
    <div>
      <span data-testid="audience">{audience}</span>
      <span data-testid="cta">{AUDIENCE_CONFIG[audience].ctaLabel}</span>
      <button onClick={() => setAudience('business')}>Choose business</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AudienceProvider>
      <Probe />
    </AudienceProvider>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  mockPathname.value = '/';
});

describe('AudienceProvider', () => {
  it('defaults to individual — the primary persona and homepage default', () => {
    renderProbe();
    expect(screen.getByTestId('audience')).toHaveTextContent('individual');
  });

  it('surfaces the CTA matching the selected audience', async () => {
    const user = userEvent.setup();
    renderProbe();

    // The whole point of the selector: a Business visitor must see "Request a
    // Demo", never the consumer app-download CTA (FEAT-009's criteria).
    expect(screen.getByTestId('cta')).toHaveTextContent('Get the App');
    await user.click(screen.getByRole('button', { name: 'Choose business' }));
    expect(screen.getByTestId('cta')).toHaveTextContent('Request a Demo');
  });

  it('persists a selection to sessionStorage so it survives navigation', async () => {
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole('button', { name: 'Choose business' }));
    expect(window.sessionStorage.getItem('safepass:audience')).toBe('business');
  });

  it('restores a stored selection on a later page in the same session', () => {
    window.sessionStorage.setItem('safepass:audience', 'transport');
    renderProbe();
    expect(screen.getByTestId('audience')).toHaveTextContent('transport');
  });

  it('adopts the audience of a deep-linked page', () => {
    // A "For Business" URL forwarded to a colleague must not open showing
    // consumer messaging — user_flow.md's Global Flow states this explicitly.
    mockPathname.value = '/business';
    renderProbe();
    expect(screen.getByTestId('audience')).toHaveTextContent('business');
  });

  it('lets a deep link override a conflicting stored selection', () => {
    // The URL is the more recent, more explicit signal of intent.
    window.sessionStorage.setItem('safepass:audience', 'individual');
    mockPathname.value = '/transport-partners';
    renderProbe();
    expect(screen.getByTestId('audience')).toHaveTextContent('transport');
  });

  it('ignores a corrupted stored value rather than rendering an invalid state', () => {
    window.sessionStorage.setItem('safepass:audience', 'not-an-audience');
    renderProbe();
    expect(screen.getByTestId('audience')).toHaveTextContent('individual');
  });
});
