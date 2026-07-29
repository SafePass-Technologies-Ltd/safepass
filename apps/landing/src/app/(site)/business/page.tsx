import type { Metadata } from 'next';
import { Reveal } from '@/components/motion/reveal';
import { Container, Section } from '@/components/ui/container';
import { DemoRequestForm } from '@/components/forms/demo-request-form';
import { CredibilityPreview } from '@/sections/credibility';
import { OverviewDownload } from '@/sections/corporate/overview-download';
import {
  AssetPlaceholder,
  ContentCardGrid,
  ContentSection,
  SectionHeading,
} from '@/sections/shared/content-blocks';
import { CORPORATE_CONTENT } from '@/lib/content/audience-pages';

/**
 * Corporate Audience Page — FEAT-009 + FEAT-010,
 * `screens/03-corporate-audience-page.md`.
 *
 * Desktop-first and content-dense: Tunde runs a longer evaluative session than
 * Amaka, so this page prioritises legibility and scannability over spectacle.
 * No parallax, no pinned sequences, no canvas layer — branding.md's "motion is
 * evidence, not decoration" applied to a page whose job is surviving a security
 * review.
 *
 * Section order per the screen doc: value statement → use cases → dashboard
 * capability → data handling → embedded credibility → downloadable overview →
 * demo form (terminal).
 */

export const metadata: Metadata = {
  title: 'SafePass for business — staff road travel monitoring',
  description:
    'Monitor staff road journeys with live human oversight, alerting, and reporting. Request a demo for banks, oil & gas, NGOs, and field teams operating in Nigeria.',
  alternates: { canonical: '/business' },
};

export default function BusinessPage() {
  return (
    <>
      <ContentSection
        eyebrow={CORPORATE_CONTENT.eyebrow}
        heading={CORPORATE_CONTENT.heading}
        lead={CORPORATE_CONTENT.lead}
        headingLevel="h1"
      />

      <ContentSection
        heading="Where organisations use it"
        lead="Two patterns that account for most corporate road travel."
      >
        <ContentCardGrid cards={CORPORATE_CONTENT.useCases} />
      </ContentSection>

      <ContentSection
        heading={CORPORATE_CONTENT.dashboard.heading}
        lead={CORPORATE_CONTENT.dashboard.lead}
      >
        <ContentCardGrid cards={CORPORATE_CONTENT.dashboard.capabilities} columns={3} />
        {/* screens/03's Asset Plan is explicit that dashboard imagery must come
            from the real product once it exists, never AI-generated or invented,
            with a labelled placeholder until then. */}
        <Reveal>
          <AssetPlaceholder label="Dashboard preview coming soon" />
        </Reveal>
      </ContentSection>

      <ContentSection
        heading={CORPORATE_CONTENT.dataPosture.heading}
        lead={CORPORATE_CONTENT.dataPosture.lead}
      >
        <ContentCardGrid cards={CORPORATE_CONTENT.dataPosture.points} columns={3} />
        <Reveal>
          <p className="text-body-small text-text-secondary">
            {CORPORATE_CONTENT.dataPosture.policyNote}
          </p>
        </Reveal>
      </ContentSection>

      {/* FEAT-005's shared module, embedded — the same component rendered on the
          homepage and standalone at /how-we-verify, per screens.md's
          Cross-Screen Notes. Tunde's evaluation is exactly who it is for. */}
      <CredibilityPreview className="bg-surface-secondary" />

      <OverviewDownload />

      {/* Terminal section, deep-linkable at /business#demo per the screen doc. */}
      <Section id="demo" className="bg-surface-secondary">
        <Container className="flex flex-col gap-xl">
          <SectionHeading
            heading={CORPORATE_CONTENT.demo.heading}
            lead={CORPORATE_CONTENT.demo.lead}
          />
          <div className="max-w-(--container-prose)">
            <DemoRequestForm />
          </div>
        </Container>
      </Section>
    </>
  );
}
