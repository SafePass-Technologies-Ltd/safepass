import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import IndividualPage from './individual/page';
import BusinessPage from './business/page';
import TransportPartnersPage from './transport-partners/page';
import BusinessOverviewPage from '../(print)/business-overview/page';

/**
 * FEAT-006, FEAT-009, FEAT-011 — the three audience pages.
 *
 * Asserted against `renderToStaticMarkup`, which is literally what a crawler
 * and a JavaScript-disabled visitor receive. That matters more than usual here:
 * these pages carry the pricing, capability, and cost content each persona came
 * for, and the README's non-goals forbid gating explainer content behind
 * interaction. If a claim only appears after hydration, it fails the point of
 * the page.
 */

function markup(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('Individual Traveller Page (FEAT-006)', () => {
  const html = markup(<IndividualPage />);

  it('states both pricing figures in the server HTML, not behind a signup', () => {
    // FEAT-006 AC1: pricing stated plainly and prominently, never hidden.
    expect(html).toContain('₦2,000');
    expect(html).toMatch(/per monitored journey/i);
    expect(html).toMatch(/minimum wallet funding/i);
  });

  it('describes both documented individual use cases', () => {
    // FEAT-006 AC2 requires the two named in docs/SafePass/README.md.
    expect(html).toMatch(/inter-city travel/i);
    expect(html).toMatch(/high-risk corridor/i);
  });

  it('makes the app store the primary action, not a lead form', () => {
    // FEAT-006 AC3. A lead form on this page would be the wrong conversion.
    expect(html).toMatch(/app store|google play/i);
    expect(html).not.toMatch(/request a demo|fleet size/i);
  });

  it('offers a route to the credibility page for visitors wanting proof first', () => {
    expect(html).toContain('/how-we-verify');
  });
});

describe('Corporate Audience Page (FEAT-009)', () => {
  const html = markup(<BusinessPage />);

  it('names both documented corporate use cases', () => {
    // FEAT-009 AC1.
    expect(html).toMatch(/staff travel between branches/i);
    expect(html).toMatch(/field operations/i);
  });

  it('describes the corporate dashboard at marketing depth', () => {
    // FEAT-009 AC2 — capability names, no internal implementation detail.
    expect(html).toMatch(/staff management/i);
    expect(html).toMatch(/live trip monitoring/i);
    expect(html).toMatch(/history and reports/i);
  });

  it('offers the downloadable overview asset', () => {
    // FEAT-009 AC3 — something Tunde can save and forward internally.
    expect(html).toContain('/business-overview');
  });

  it("makes Request a Demo the page's primary CTA, not the app download", () => {
    // FEAT-009 AC4.
    expect(html).toMatch(/request a demo/i);
    expect(html).not.toMatch(/google play/i);
  });

  it('exposes the demo form at a deep-linkable anchor', () => {
    expect(html).toContain('id="demo"');
  });

  it('renders a dashboard preview image (client override of screens/03)', () => {
    // screens/03's Asset Plan asks for real product screenshots, never AI. The
    // client overrode that for a fill-in, so this asserts the illustrative
    // preview renders — and records the override in the comment for whoever
    // swaps in real screenshots.
    expect(html).toContain('business-dashboard-preview');
    expect(html).toMatch(/preview of the safepass corporate monitoring dashboard/i);
  });

  it('embeds the shared credibility module rather than restating its claims', () => {
    expect(html).toMatch(/how we verify|verification/i);
  });
});

describe('Transport Partner Page (FEAT-011)', () => {
  const html = markup(<TransportPartnersPage />);

  it('describes vehicle/driver management and QR verification', () => {
    // FEAT-011 AC1, matching the Transport Partner Dashboard's documented scope.
    expect(html).toMatch(/vehicle management/i);
    expect(html).toMatch(/driver management/i);
    expect(html).toMatch(/QR/);
  });

  it('answers cost and operational effort head-on', () => {
    // FEAT-011 AC2 — Chidinma's two stated frustrations, addressed even if
    // non-bindingly.
    expect(html).toMatch(/what does it cost my business/i);
    expect(html).toMatch(/how much operational work/i);
    expect(html).toMatch(/subscription and per-trip/i);
  });

  it('publishes no fixed fleet price, since none is documented', () => {
    // screens/04 requires the framing stay non-committal, and inventing a
    // number here would set an expectation the page cannot fulfil.
    expect(html).not.toMatch(/₦[\d,]+\s*(per vehicle|\/vehicle|per month|\/month)/i);
  });

  it('frames the passenger-facing safety differentiator as marketable', () => {
    // FEAT-011 AC3.
    expect(html).toMatch(/passengers can verify the vehicle/i);
  });

  it("makes Partner With Us the primary CTA, not the app download", () => {
    // FEAT-011 AC4.
    expect(html).toMatch(/partner with us|talk to us/i);
    expect(html).not.toMatch(/google play/i);
  });

  it('exposes the inquiry form at a deep-linkable anchor', () => {
    expect(html).toContain('id="inquiry"');
  });

  it('renders fleet imagery (client override of screens/04)', () => {
    // screens/04's Asset Plan asks for real partnered-vehicle photography, never
    // AI. The client overrode that for a fill-in, so this asserts the
    // representative image renders — and records the override for whoever swaps
    // in real photos.
    expect(html).toContain('transport-fleet');
    expect(html).toMatch(/safepass-partnered passenger bus fleet at dusk/i);
  });
});

describe('Corporate overview (FEAT-009 downloadable asset)', () => {
  const html = markup(<BusinessOverviewPage />);

  it('carries the same sourced content as the /business page', () => {
    // Derived from one content module, so the document Tunde forwards can never
    // drift from what the site says.
    expect(html).toMatch(/staff travel between branches/i);
    expect(html).toMatch(/field operations/i);
    expect(html).toContain('₦2,000');
  });

  it('gives a next step and a contact route', () => {
    expect(html).toMatch(/request a demo/i);
    expect(html).toMatch(/@/);
  });
});

describe('cross-page audience separation (R-001)', () => {
  it('keeps each audience page on its own converting action', () => {
    // R-001 is "single site serving three buyer types dilutes messaging". The
    // structural defence is that no page offers another audience's CTA.
    const individual = markup(<IndividualPage />);
    const business = markup(<BusinessPage />);
    const transport = markup(<TransportPartnersPage />);

    expect(individual).not.toMatch(/fleet size/i);
    expect(business).not.toMatch(/fleet size/i);
    expect(transport).toMatch(/fleet/i);
  });
});
