import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import PrivacyPage, { metadata as privacyMetadata } from './privacy/page';
import TermsPage, { metadata as termsMetadata } from './terms/page';
import AboutPage, { metadata as aboutMetadata } from './about/page';
import { privacyPolicy } from '@/lib/content/legal/privacy-policy';
import { termsOfService } from '@/lib/content/legal/terms-of-service';
import { about } from '@/lib/content/legal/about';

/**
 * FEAT-015 — Legal & Company Pages.
 *
 * These pages carry a launch dependency, not just a content one: risk_log.md
 * R-011 gates every lead-capture form on the Privacy Policy being live and
 * linked. So the tests assert the pages are genuinely published content —
 * substantive, indexable, cross-linked — rather than that they merely render.
 */

// next/link is a client component that reaches for the App Router context,
// which does not exist when rendering these Server Components directly.
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const PAGES = [
  { name: 'Privacy Policy', Page: PrivacyPage, metadata: privacyMetadata, doc: privacyPolicy },
  { name: 'Terms of Service', Page: TermsPage, metadata: termsMetadata, doc: termsOfService },
  { name: 'About SafePass', Page: AboutPage, metadata: aboutMetadata, doc: about },
] as const;

describe.each(PAGES)('$name page', ({ Page, metadata, doc }) => {
  // Criteria 1 & 2 — the pages are published, i.e. they render their real
  // content and not a Foundation shell.
  it('renders its title as the page h1', () => {
    render(<Page />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(doc.title);
  });

  it('is not a Foundation placeholder shell', () => {
    render(<Page />);
    expect(screen.queryByText(/Foundation shell/i)).not.toBeInTheDocument();
  });

  // screens/06 and /07 both list "Last updated date" as a required component:
  // transparency on content currency.
  it('shows a machine-readable last-updated date', () => {
    const { container } = render(<Page />);
    const time = container.querySelector('time');

    expect(time).not.toBeNull();
    expect(time).toHaveAttribute('dateTime', doc.lastUpdated);
  });

  it('renders every documented section with a linkable anchor', () => {
    const { container } = render(<Page />);

    for (const section of doc.sections) {
      expect(container.querySelector(`#${section.id}`)).not.toBeNull();
      expect(screen.getByRole('heading', { level: 2, name: section.heading })).toBeInTheDocument();
    }
  });

  // Criterion 4 — "All three pages are indexable". Robots must be explicit,
  // and each page needs its own title/description so they aren't deduplicated
  // in search results.
  it('exposes indexable, unique metadata', () => {
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.title).toBeTruthy();
    expect(metadata.description).toBe(doc.description);
  });

  // Criterion 4 — "reachable within two clicks from the homepage". Hop 1 is
  // the shared Footer link (owned by the layout slice); hop 2 is these
  // cross-links, which are what make the three pages navigable between
  // themselves without returning home.
  it('cross-links to its documented exit points', () => {
    render(<Page />);
    const related = screen.getByRole('navigation', { name: 'Related pages' });

    for (const link of doc.relatedLinks) {
      expect(within(related).getByRole('link', { name: link.label })).toHaveAttribute(
        'href',
        link.href
      );
    }
  });
});

describe('Privacy Policy', () => {
  // Not decoration: Tunde is checking data handling before submitting company
  // information, and an NDPR-shaped disclosure has to actually cover these.
  it.each([
    ['information-we-collect', 'what data is collected'],
    ['how-we-use-information', 'why it is processed'],
    ['lawful-basis', 'the lawful basis'],
    ['sharing', 'third-party sharing'],
    ['retention', 'how long it is kept'],
    ['your-rights', 'data-subject rights'],
    ['international-transfers', 'transfers outside Nigeria'],
    ['contact', 'how to reach us'],
  ])('discloses %s (%s)', (sectionId) => {
    const { container } = render(<PrivacyPage />);
    expect(container.querySelector(`#${sectionId}`)).not.toBeNull();
  });

  it('lists the data-subject rights individually rather than gesturing at them', () => {
    const { container } = render(<PrivacyPage />);
    const rights = container.querySelector('#your-rights');

    expect(rights?.querySelectorAll('li').length).toBeGreaterThanOrEqual(5);
    expect(rights?.textContent).toContain('Nigeria Data Protection Commission');
  });

  it('shows a table of contents for jumping to a section', () => {
    render(<PrivacyPage />);
    const toc = screen.getByRole('navigation', { name: 'On this page' });

    const anchors = within(toc).getAllByRole('link');
    expect(anchors).toHaveLength(privacyPolicy.sections.length);
    // Anchors, not routes — they must jump within the page.
    for (const anchor of anchors) {
      expect(anchor.getAttribute('href')).toMatch(/^#/);
    }
  });

  // The prose is placeholder pending counsel. Presenting it as binding would
  // be worse than saying so — and R-011's contingency depends on the gap being
  // visible rather than silent. The wording is confidence-inspiriring (client
  // feedback) but must still state the review is not yet complete.
  it('states that the wording is still under legal review', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('note')).toHaveTextContent(/legal review/i);
    expect(screen.getByRole('note')).toHaveTextContent(/final legal review/i);
  });

  it('leads with a positive security statement before the limitation', () => {
    const { container } = render(<PrivacyPage />);
    const security = container.querySelector('#security')?.textContent ?? '';

    const positiveIndex = security.indexOf('We protect information using encryption');
    const limitationIndex = security.indexOf('Although no system can guarantee');
    expect(positiveIndex).toBeGreaterThan(-1);
    expect(limitationIndex).toBeGreaterThan(-1);
    expect(positiveIndex).toBeLessThan(limitationIndex);
  });

  it('renders the "we do not sell" statement as an emphasised trust line', () => {
    const { container } = render(<PrivacyPage />);
    const useSection = container.querySelector('#how-we-use-information');

    expect(useSection?.textContent).toContain('We do not sell your personal information.');
  });

  it('separates provided vs automatic information into groups', () => {
    const { container } = render(<PrivacyPage />);
    const collect = container.querySelector('#information-we-collect');

    expect(collect?.textContent).toContain('Information you provide');
    expect(collect?.textContent).toContain('Information collected automatically');
  });

  it('states the never-sell-to-advertisers sentence in sharing', () => {
    const { container } = render(<PrivacyPage />);
    const sharing = container.querySelector('#sharing')?.textContent ?? '';

    expect(sharing).toContain('We never sell or rent personal information to advertisers or data brokers.');
  });

  it('makes the data-subject rights scannable with a check-style list', () => {
    const { container } = render(<PrivacyPage />);
    const rights = container.querySelector('#your-rights');

    expect(rights?.querySelectorAll('li').length).toBeGreaterThanOrEqual(5);
    // Check icons render beside each right (aria-hidden decorative markers).
    expect(rights?.querySelectorAll('[aria-hidden="true"] svg').length).toBeGreaterThanOrEqual(5);
  });

  it('states the contact response-time commitment', () => {
    const { container } = render(<PrivacyPage />);
    const contact = container.querySelector('#contact')?.textContent ?? '';

    expect(contact).toMatch(/respond to privacy enquiries within 30 days/i);
  });

  it('opens with the trust commitment section', () => {
    const { container } = render(<PrivacyPage />);
    const commitment = container.querySelector('#privacy-commitment');

    expect(commitment?.textContent).toContain('SafePass exists to improve personal safety');
  });

  it('states no specific retention period, which only counsel can set', () => {
    const { container } = render(<PrivacyPage />);
    const retention = container.querySelector('#retention')?.textContent ?? '';

    // A fabricated "we keep it for 24 months" is exactly the invented
    // requirement this test exists to prevent regressing into.
    expect(retention).not.toMatch(/\b\d+\s*(days?|months?|years?)\b/i);
  });
});

describe('Terms of Service', () => {
  it('scopes itself to the website, not the SafePass app or dashboards', () => {
    const { container } = render(<TermsPage />);
    const scope = container.querySelector('#scope')?.textContent ?? '';

    expect(scope).toMatch(/does not provide trip monitoring/i);
  });

  it('states no liability cap, which only counsel can set', () => {
    const { container } = render(<TermsPage />);
    const liability = container.querySelector('#liability')?.textContent ?? '';

    expect(liability).not.toMatch(/₦|\$|\bNGN\b/);
  });

  it('states plainly that the wording is still under legal review', () => {
    render(<TermsPage />);
    expect(screen.getByRole('note')).toHaveTextContent(/legal review/i);
  });

  it('names the shared legal-review notice with its own title, not the Privacy Policy', () => {
    render(<TermsPage />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(/Terms of Service is currently undergoing final legal review/i);
    expect(note).not.toHaveTextContent(/Privacy Policy is currently/i);
  });

  it('prohibits reverse engineering, scraping, and interference with the site', () => {
    const { container } = render(<TermsPage />);
    const useOfSite = container.querySelector('#use-of-site')?.textContent ?? '';

    expect(useOfSite).toMatch(/reverse engineer, scrape, interfere with/i);
  });

  it('asks visitors not to submit confidential information unless requested', () => {
    const { container } = render(<TermsPage />);
    const submit = container.querySelector('#information-you-submit')?.textContent ?? '';

    expect(submit).toMatch(/not to submit confidential information unless specifically requested/i);
  });

  it('names the protected intellectual property categories', () => {
    const { container } = render(<TermsPage />);
    const ip = container.querySelector('#intellectual-property');

    expect(ip?.querySelectorAll('li').length).toBeGreaterThanOrEqual(3);
    expect(ip?.textContent).toMatch(/brand marks/i);
    expect(ip?.textContent).toMatch(/database rights/i);
  });

  it('disclaims warranties with standard as-is / as-available wording', () => {
    const { container } = render(<TermsPage />);
    const disclaimers = container.querySelector('#disclaimers')?.textContent ?? '';

    expect(disclaimers).toMatch(/"as is" and "as available"/i);
  });

  it('states the governing law explicitly', () => {
    const { container } = render(<TermsPage />);
    const law = container.querySelector('#governing-law')?.textContent ?? '';

    expect(law).toMatch(/governed by the laws of the Federal Republic of Nigeria/i);
  });

  it('states the contact response-time commitment', () => {
    const { container } = render(<TermsPage />);
    const contact = container.querySelector('#contact')?.textContent ?? '';

    expect(contact).toMatch(/respond to enquiries within 30 days/i);
  });

  it('opens the commitment trust statement', () => {
    const { container } = render(<TermsPage />);
    const commitment = container.querySelector('#commitment');

    expect(commitment?.textContent).toContain('SafePass is committed to providing accurate information');
  });
});

describe('About page', () => {
  // screens/08's Edge Case: "a thin, generic 'About Us' page fails this
  // screen's actual purpose even if technically complete". Tunde and Chidinma
  // read this during vendor due-diligence.
  it('covers what the product is, how monitoring works, and who it serves', () => {
    const { container } = render(<AboutPage />);
    const text = container.textContent ?? '';

    expect(text).toMatch(/human monitoring|monitoring officer/i);
    expect(text).toMatch(/incident/i);
    expect(text).toMatch(/corporate/i);
    expect(text).toMatch(/transport/i);
    expect(text).toMatch(/Nigeria/);
  });

  it('opens with the problem statement the company exists to solve', () => {
    const { container } = render(<AboutPage />);
    const why = container.querySelector('#why-safepass-exists');

    // Client feedback (T-034): the section is now the single supplied
    // problem-statement paragraph.
    expect(why?.textContent).toMatch(/every year, hundreds of thousands of journeys/i);
    expect(why?.textContent).toMatch(/trained human monitoring/i);
  });

  it('explains the Nigeria-first choice as deliberate, not incidental', () => {
    const { container } = render(<AboutPage />);
    const where = container.querySelector('#where-we-operate')?.textContent ?? '';

    expect(where).toMatch(/world[’']s most demanding safety environments/i);
  });

  it('renders an icon beside each of the four differentiator pillars', () => {
    const { container } = render(<AboutPage />);
    const differentiators = container.querySelector('#how-we-are-different');

    expect(differentiators?.querySelectorAll('[aria-hidden="true"] svg').length).toBeGreaterThanOrEqual(4);
  });

  it('names the four platform surfaces a due-diligence reader needs', () => {
    const { container } = render(<AboutPage />);
    const audiences = container.querySelector('#who-we-serve');

    expect(audiences?.querySelectorAll('li')).toHaveLength(4);
  });

  it('explains how safety data is verified, since that is what the claim rests on', () => {
    const { container } = render(<AboutPage />);
    const verification = container.querySelector('#how-safety-data-is-verified');

    expect(verification?.textContent).toMatch(/verif/i);
    // FEAT-005 / R-007: a published stat without source and as-of date is a
    // liability, and this page commits to that in prose.
    expect(verification?.textContent).toMatch(/source/i);
  });

  it('carries no legal-review notice — this copy is real, not placeholder', () => {
    render(<AboutPage />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('gives a reachable contact route', () => {
    const { container } = render(<AboutPage />);
    expect(container.querySelector('#working-with-us')?.textContent).toMatch(/@/);
  });
});
