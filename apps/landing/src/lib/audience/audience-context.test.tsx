import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AudienceProvider, useAudience, AUDIENCE_CONFIG } from './audience-context';

/**
 * Audience state (FEAT-001), as narrowed in T-037.
 *
 * The provider no longer exposes a setter: the URL is the only writer (the
 * pathname-adopt effect), and sessionStorage exists solely to carry the
 * audience across pages whose URL names none — user_flow.md's "Audience
 * Selector Persistence" global flow. These tests pin that contract: the
 * deep-link override, the session restore, and the corrupted-value fallback.
 */

const mockPathname = vi.hoisted(() => ({ value: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
}));

function Probe() {
  const { audience } = useAudience();
  return (
    <div>
      <span data-testid="audience">{audience}</span>
      <span data-testid="cta">{AUDIENCE_CONFIG[audience].ctaLabel}</span>
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

  it('adopts the audience of a deep-linked page', () => {
    // A "For Business" URL forwarded to a colleague must not open showing
    // consumer messaging — user_flow.md's Global Flow states this explicitly.
    mockPathname.value = '/business';
    renderProbe();
    expect(screen.getByTestId('audience')).toHaveTextContent('business');
    expect(screen.getByTestId('cta')).toHaveTextContent('Request a Demo');
  });

  it('persists the adopted audience to sessionStorage', () => {
    // Landing on /business writes the choice so later, audience-less pages
    // keep the matched CTA.
    mockPathname.value = '/business';
    renderProbe();

    expect(window.sessionStorage.getItem('safepass:audience')).toBe('business');
  });

  it('restores a stored selection on a later page in the same session', () => {
    window.sessionStorage.setItem('safepass:audience', 'transport');
    renderProbe();
    expect(screen.getByTestId('audience')).toHaveTextContent('transport');
    expect(screen.getByTestId('cta')).toHaveTextContent('Partner With Us');
  });

  it('lets a deep link override a conflicting stored selection', () => {
    // The URL is the more recent, more explicit signal of intent.
    window.sessionStorage.setItem('safepass:audience', 'individual');
    mockPathname.value = '/transport-partners';
    renderProbe();
    expect(screen.getByTestId('audience')).toHaveTextContent('transport');
  });

  it('keeps the default on pages whose URL carries no audience signal', () => {
    // /privacy etc. have no audience — the stored (or default) value applies.
    mockPathname.value = '/privacy';
    renderProbe();
    expect(screen.getByTestId('audience')).toHaveTextContent('individual');
  });

  it('ignores a corrupted stored value rather than rendering an invalid state', () => {
    window.sessionStorage.setItem('safepass:audience', 'not-an-audience');
    renderProbe();
    expect(screen.getByTestId('audience')).toHaveTextContent('individual');
  });
});
