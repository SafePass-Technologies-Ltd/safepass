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
    expect(html).toMatch(/minimum wallet top-up/i);
  });

  it('leads its pricing section with value and reassurance, not just the price', () => {
    // Client feedback: the section must reframe ₦2,000 as a lot of value, not
    // lead with the figure. Reassurance badges and the "includes" box both ship
    // in the server HTML.
    expect(html).toMatch(/simple, transparent pricing/i);
    expect(html).toMatch(/no subscription/i);
    expect(html).toMatch(/pay per journey/i);
    expect(html).toMatch(/every monitored journey includes/i);
    expect(html).toMatch(/a live safepass monitoring officer/i);
  });

  it('describes the four documented individual use cases', () => {
    // FEAT-006 AC2 requires the two named in docs/SafePass/README.md; Local
    // journeys and "when someone is waiting" were added on client feedback to
    // broaden the market beyond "dangerous roads".
    expect(html).toMatch(/inter-city travel/i);
    expect(html).toMatch(/high-risk corridor/i);
    expect(html).toMatch(/local journeys/i);
    expect(html).toMatch(/when someone is waiting for you/i);
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

  it('names the three corporate use cases', () => {
    // FEAT-009 AC1 — the two documented use cases plus Executive & VIP travel,
    // added on client feedback to widen enterprise appeal.
    expect(html).toMatch(/staff travel between branches/i);
    expect(html).toMatch(/field operations/i);
    expect(html).toMatch(/executive/i);
    expect(html).toMatch(/vip travel/i);
  });

  it('describes the corporate dashboard at marketing depth', () => {
    // FEAT-009 AC2 — capability names, no internal implementation detail.
    // The ampersand in "People & team management" renders as &amp; in static
    // markup, so the name is matched a-word-at-a-time.
    expect(html).toMatch(/people/i);
    expect(html).toMatch(/team management/i);
    expect(html).toMatch(/live trip monitoring/i);
    expect(html).toMatch(/history and reports/i);
    expect(html).toMatch(/journey analytics/i);
  });

  it('answers the security review with role-based access', () => {
    // Businesses ask about access control immediately; the data-posture card
    // answers it without claiming any compliance certification.
    expect(html).toMatch(/access is role-based/i);
  });

  it('names the industries SafePass fits, without claiming any as a customer', () => {
    expect(html).toMatch(/suitable for organisations like/i);
    expect(html).toMatch(/oil/i);
    expect(html).toMatch(/financial services/i);
    expect(html).toMatch(/government/i);
  });

  it('presents the "why choose SafePass" comparison', () => {
    expect(html).toMatch(/why organisations choose safepass/i);
    expect(html).toMatch(/live monitored journey/i);
    expect(html).toMatch(/full audit history/i);
    expect(html).toMatch(/emergency response workflow/i);
  });

  it('annotates the dashboard preview with a numbered call-out legend', () => {
    expect(html).toMatch(/active journeys/i);
    expect(html).toMatch(/live officer monitoring/i);
    expect(html).toMatch(/incident history/i);
  });

  it('presents an explicitly-illustrative case study, not published data', () => {
    // R-007: the figures must be framed as an example, so they are never read
    // as SafePass operational data.
    expect(html).toMatch(/illustrative example/i);
    expect(html).toMatch(/324/i);
    expect(html).toMatch(/arrival confirmation/i);
    expect(html).toMatch(/illustrative figures shown/i);
  });

  it('shows the assurance strip for procurement reviewers', () => {
    expect(html).toMatch(/built for procurement and legal review/i);
    expect(html).toMatch(/audit logs/i);
    expect(html).toMatch(/role-based access/i);
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
    // Deliberately NOT "Driver Verification History": the QR verification page
    // never exposes driver data, so that claim is not shipped (Non-Negotiable 5).
    expect(html).not.toMatch(/driver verification history/i);
  });

  it('gives the QR code its own section as a passenger trust signal', () => {
    // Client feedback: the per-vehicle QR is a top selling point, so it gets a
    // dedicated section rather than sitting inside a capability list.
    expect(html).toMatch(/every vehicle gets its own safepass identity/i);
    expect(html).toMatch(/correct vehicle/i);
    expect(html).toMatch(/documents are current/i);
  });

  it('lists the operator benefits and fleet types SafePass serves', () => {
    expect(html).toMatch(/why operators partner with safepass/i);
    expect(html).toMatch(/reduce incident response time/i);
    expect(html).toMatch(/suitable for/i);
    expect(html).toMatch(/ride-hailing fleets/i);
    expect(html).toMatch(/logistics personnel transport/i);
  });

  it('answers the passenger-friction question directly', () => {
    expect(html).toMatch(/will passengers have to install safepass/i);
    expect(html).toMatch(/works without changing your existing booking process/i);
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

  it('carries the Road Journey Assurance category on every audience page', () => {
    // The owned category name must be consistent across the three audience
    // pages, so the site never presents two different category names.
    const individual = markup(<IndividualPage />);
    const business = markup(<BusinessPage />);
    const transport = markup(<TransportPartnersPage />);

    expect(individual).toMatch(/road journey assurance/i);
    expect(business).toMatch(/road journey assurance/i);
    expect(transport).toMatch(/road journey assurance/i);
  });

  it('reframes the lead lines around certainty, not just monitoring', () => {
    const individual = markup(<IndividualPage />);
    const business = markup(<BusinessPage />);

    expect(individual).toMatch(/certainty that someone knows where you are/i);
    expect(business).toMatch(/prove you met your duty of care/i);
  });
});
