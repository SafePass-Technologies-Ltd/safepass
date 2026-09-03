import type { Metadata } from 'next';
import Link from 'next/link';
import { Container, Section } from '@/components/ui/container';
import { CredibilitySection } from '@/sections/credibility';

/**
 * Credibility & Safety-Data Page — `screens/05-credibility-page.md`.
 * FEAT-005 (content), FEAT-013 (SEO entry point).
 *
 * Fully static: no client-fetched data, no dynamic APIs, no `'use client'`
 * boundary at the page level. screens/05 lists no loading state for exactly
 * this reason — the content is in the HTML the crawler and the browser both
 * receive, which is this page's primary technical requirement.
 */

export const metadata: Metadata = {
  title: 'How we verify safety data',
  description:
    "How SafePass builds its safety map from public incident records, grows it from travellers' journeys, and weights every report across five verification tiers, with sources and dates.",
  alternates: { canonical: '/how-we-verify' },
};

/** Exit points, per the screen doc. */
const RELATED_LINKS = [
  { href: '/individual', label: 'SafePass for individual travellers' },
  { href: '/business', label: 'SafePass for business' },
  { href: '/transport-partners', label: 'SafePass for transport partners' },
] as const;

export default function HowWeVerifyPage() {
  return (
    <>
      {/* The module owns the page's h1 here, since this is its standalone home. */}
      <CredibilitySection id="methodology" headingLevel="h1" />

      <Section className="border-t border-border">
        <Container className="flex flex-col gap-md">
          <h2 className="text-h3 text-text-primary">Where to next</h2>
          <ul className="flex flex-col gap-sm">
            {RELATED_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-body font-medium text-accent-text hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Section>
    </>
  );
}
