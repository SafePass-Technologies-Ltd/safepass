import type { Metadata } from 'next';
import { Reveal } from '@/components/motion/reveal';
import { CredibilityPreview } from '@/sections/credibility';
import { PartnerInquirySection } from '@/sections/transport/partner-inquiry';
import {
  AssetPlaceholder,
  ContentCardGrid,
  ContentSection,
} from '@/sections/shared/content-blocks';
import { TRANSPORT_CONTENT } from '@/lib/content/audience-pages';

/**
 * Transport Partner Audience Page — FEAT-011,
 * `screens/04-transport-partner-audience-page.md`.
 *
 * Motion and pacing are deliberately identical to the Corporate page — the
 * screen doc asks for that explicitly, "for visual system consistency across
 * both B2B audience pages". No parallax, no pinned sequence, no canvas.
 *
 * Section order per the screen doc: value statement → vehicle & driver
 * management → passenger-facing differentiator → cost & onboarding → embedded
 * credibility → partner inquiry form (terminal).
 *
 * Every section is server-rendered with no session-dependent content, which is
 * a requirement rather than an incidental property: Chidinma's documented
 * behaviour is forwarding the link to her director, so a colleague opening it
 * cold must get exactly the same page.
 */

export const metadata: Metadata = {
  title: 'SafePass for transport partners — monitored trips for fleets',
  description:
    'Vehicle and driver verification, QR-checkable vehicles, and journeys monitored live by real officers — a passenger-safety differentiator fleet operators can advertise.',
  alternates: { canonical: '/transport-partners' },
};

export default function TransportPartnersPage() {
  return (
    <>
      <ContentSection
        eyebrow={TRANSPORT_CONTENT.eyebrow}
        heading={TRANSPORT_CONTENT.heading}
        lead={TRANSPORT_CONTENT.lead}
        headingLevel="h1"
      />

      <ContentSection heading={TRANSPORT_CONTENT.fleet.heading} lead={TRANSPORT_CONTENT.fleet.lead}>
        <ContentCardGrid cards={TRANSPORT_CONTENT.fleet.capabilities} columns={3} />
        {/* screens/04's Asset Plan is explicit: fleet photography must be real
            once available, never AI-generated, because "a fabricated fleet photo
            undermines exactly the operational credibility Chidinma is
            evaluating". Labelled placeholder until then. */}
        <Reveal>
          <AssetPlaceholder label="Partner fleet imagery coming soon" />
        </Reveal>
      </ContentSection>

      <ContentSection
        heading={TRANSPORT_CONTENT.differentiator.heading}
        lead={TRANSPORT_CONTENT.differentiator.lead}
      >
        <ContentCardGrid cards={TRANSPORT_CONTENT.differentiator.points} columns={3} />
      </ContentSection>

      <ContentSection
        id="cost"
        heading={TRANSPORT_CONTENT.costOnboarding.heading}
        lead={TRANSPORT_CONTENT.costOnboarding.lead}
      >
        <ContentCardGrid cards={TRANSPORT_CONTENT.costOnboarding.points} />
      </ContentSection>

      {/* The same shared FEAT-005 module the homepage and /business embed. */}
      <CredibilityPreview />

      <PartnerInquirySection />
    </>
  );
}
