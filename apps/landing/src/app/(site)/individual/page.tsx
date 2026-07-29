import type { Metadata } from 'next';
import { Reveal } from '@/components/motion/reveal';
import { AppStoreCta } from '@/components/ui/app-store-cta';
import { Container, Section } from '@/components/ui/container';
import { ContentCardGrid, ContentSection } from '@/sections/shared/content-blocks';
import { PricingBlock } from '@/sections/individual/pricing-block';
import { INDIVIDUAL_CONTENT } from '@/lib/content/audience-pages';
import { clientEnv } from '@/lib/env';

/**
 * Individual Traveller Page — FEAT-006, `screens/02-individual-traveller-page.md`.
 *
 * Fast and scannable by design: no pinned sequence at any breakpoint, no
 * parallax, no canvas layer. Amaka is mobile-first on an inconsistent network
 * and decides quickly (user_personas.md), and this page's job is conversion
 * rather than brand introduction — so the whole page is Server Components with
 * a light reveal layer on top.
 *
 * Section order per the screen doc: value proposition → pricing → use cases →
 * app store CTA.
 *
 * FEAT-008's Waitlist form (the "Loaded — Waitlist Only" state) is Phase 2. The
 * `appLive` flag is already read here so that slice is a component swap rather
 * than a page rewrite.
 */

export const metadata: Metadata = {
  title: 'SafePass for travellers — monitored road journeys in Nigeria',
  description:
    'Register a journey and a real SafePass officer monitors it live from departure to arrival. ₦2,000 per monitored journey, no subscription.',
  alternates: { canonical: '/individual' },
};

export default function IndividualPage() {
  return (
    <>
      <ContentSection
        eyebrow={INDIVIDUAL_CONTENT.eyebrow}
        heading={INDIVIDUAL_CONTENT.heading}
        lead={INDIVIDUAL_CONTENT.lead}
        headingLevel="h1"
      >
        {/*
          The converting action sits above the fold as well as at the foot of
          the page — FEAT-006 AC3 makes the app store CTA the primary action
          here, and a visitor arriving from the homepage hero may already be
          convinced.
        */}
        <Reveal>
          <AppStoreCta />
        </Reveal>
      </ContentSection>

      <PricingBlock />

      <ContentSection heading="When people use SafePass" lead="The two journeys it was built for.">
        <ContentCardGrid cards={INDIVIDUAL_CONTENT.useCases} />
      </ContentSection>

      {/* Terminal CTA, repeated deliberately: the visitor who read the whole
          page is the likeliest to act, and sending them back up to the top to
          do it loses conversions. */}
      <Section id="get-the-app" className="bg-surface-secondary">
        <Container className="flex flex-col items-start gap-lg">
          <Reveal className="flex max-w-(--container-prose) flex-col gap-sm">
            <h2 className="text-h2 text-text-primary">Get SafePass</h2>
            <p className="text-body-large text-text-secondary">
              {clientEnv.appLive
                ? 'Download the app, fund your wallet, and register your first journey.'
                : 'SafePass is not yet available to download in your market.'}
            </p>
          </Reveal>
          <Reveal>
            <AppStoreCta />
          </Reveal>
        </Container>
      </Section>
    </>
  );
}
