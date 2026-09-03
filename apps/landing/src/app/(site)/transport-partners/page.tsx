import type { Metadata } from 'next';
import Image from 'next/image';
import { Check } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { Container, Section } from '@/components/ui/container';
import { CredibilityPreview } from '@/sections/credibility';
import { PartnerInquirySection } from '@/sections/transport/partner-inquiry';
import {
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
  title: 'SafePass for transport partners: monitored trips for fleets',
  description:
    'Vehicle and driver verification, QR-checkable vehicles, and journeys monitored live by real officers. A passenger-safety differentiator fleet operators can advertise.',
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

      {/*
        Two-column header: the fleet framing on the left, the A5 fleet imagery on
        the right — keeps the photo a column (not a full-bleed 1200px banner),
        with the capability cards below. Stacks on mobile.
      */}
      <Section>
        <Container className="flex flex-col gap-xl">
          <div className="grid gap-lg lg:grid-cols-2 lg:items-center">
            <Reveal className="flex flex-col gap-sm">
              <h2 className="text-h2 text-text-primary">{TRANSPORT_CONTENT.fleet.heading}</h2>
              <p className="text-body-large text-text-secondary">{TRANSPORT_CONTENT.fleet.lead}</p>
            </Reveal>
            <Reveal>
              <div className="relative overflow-hidden rounded-lg border border-border bg-surface-secondary">
                <Image
                  src="/images/transport-fleet.webp"
                  alt="A SafePass-partnered passenger bus fleet at dusk"
                  width={2400}
                  height={1350}
                  sizes="(min-width: 1280px) 600px, (min-width: 768px) 50vw, 100vw"
                  className="h-auto w-full object-cover"
                />
              </div>
            </Reveal>
          </div>
          <ContentCardGrid cards={TRANSPORT_CONTENT.fleet.capabilities} columns={3} />
        </Container>
      </Section>

      {/* "Every vehicle gets its own SafePass identity" — the QR code section.
          Client feedback: the per-vehicle QR is one of the biggest selling
          points and was undersold, so it gets its own section. Each element is
          a capability claim, not a figure (R-007). */}
      <ContentSection
        heading={TRANSPORT_CONTENT.vehicleIdentity.heading}
        lead={TRANSPORT_CONTENT.vehicleIdentity.lead}
      >
        <Reveal>
          <ul className="grid gap-sm sm:grid-cols-2">
            {TRANSPORT_CONTENT.vehicleIdentity.checks.map((check) => (
              <li key={check} className="flex items-center gap-xs">
                <span
                  aria-hidden="true"
                  className="flex size-(--size-icon-sm) shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
                >
                  <Check className="size-(--size-icon-sm)" strokeWidth={2.5} />
                </span>
                <span className="text-body text-text-primary">{check}</span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal>
          <p className="text-body-small text-text-secondary">
            {TRANSPORT_CONTENT.vehicleIdentity.note}
          </p>
        </Reveal>
      </ContentSection>

      <ContentSection
        heading={TRANSPORT_CONTENT.partnerBenefits.heading}
        lead={TRANSPORT_CONTENT.partnerBenefits.lead}
      >
        <Reveal>
          <ul className="grid gap-sm sm:grid-cols-2 lg:grid-cols-3">
            {TRANSPORT_CONTENT.partnerBenefits.items.map((benefit) => (
              <li
                key={benefit}
                className="flex items-center gap-xs rounded-md border border-border bg-surface-secondary px-md py-sm"
              >
                <span
                  aria-hidden="true"
                  className="flex size-(--size-icon-sm) shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
                >
                  <Check className="size-(--size-icon-sm)" strokeWidth={2.5} />
                </span>
                <span className="text-body font-medium text-text-primary">{benefit}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </ContentSection>

      <ContentSection
        heading={TRANSPORT_CONTENT.differentiator.heading}
        lead={TRANSPORT_CONTENT.differentiator.lead}
      >
        <ContentCardGrid cards={TRANSPORT_CONTENT.differentiator.points} columns={3} />
      </ContentSection>

      {/* Fleet types SafePass fits — client feedback: the page read too
          bus-focused, so it now names the segments. No operator is claimed as a
          customer; this is fit-legibility only. */}
      <ContentSection
        heading={TRANSPORT_CONTENT.suitableFor.heading}
        lead={TRANSPORT_CONTENT.suitableFor.lead}
      >
        <Reveal>
          <ul className="flex flex-wrap gap-sm">
            {TRANSPORT_CONTENT.suitableFor.industries.map((industry) => (
              <li
                key={industry}
                className="rounded-full border border-border bg-surface-secondary px-md py-xs text-body font-medium text-text-primary"
              >
                {industry}
              </li>
            ))}
          </ul>
        </Reveal>
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
