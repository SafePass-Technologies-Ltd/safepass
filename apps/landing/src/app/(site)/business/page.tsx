import type { Metadata } from 'next';
import Image from 'next/image';
import { Check, X } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { Container, Section } from '@/components/ui/container';
import { DemoRequestForm } from '@/components/forms/demo-request-form';
import { CredibilityPreview } from '@/sections/credibility';
import { OverviewDownload } from '@/sections/corporate/overview-download';
import {
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
 * Section order per the screen doc: value statement → use cases → credibility
 * (moved higher on client feedback so the "we don't invent security" proof
 * lands before the capability claims) → dashboard capability → data handling →
 * suitability → comparison → downloadable overview → demo form (terminal).
 */

export const metadata: Metadata = {
  title: 'SafePass for business: staff road travel monitoring',
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
        lead="The journeys organisations most often need monitored."
      >
        <ContentCardGrid cards={CORPORATE_CONTENT.useCases} columns={3} />
      </ContentSection>

      {/* FEAT-005's shared module, embedded — the same component rendered on the
          homepage and standalone at /how-we-verify, per screens.md's
          Cross-Screen Notes. Moved above the capability claims on client
          feedback: it proves the safety data is verifiable before the page
          lists what it can do. */}
      <CredibilityPreview className="bg-surface-secondary" />

      <ContentSection
        heading={CORPORATE_CONTENT.dashboard.heading}
        lead={CORPORATE_CONTENT.dashboard.lead}
      >
        <ContentCardGrid cards={CORPORATE_CONTENT.dashboard.capabilities} columns={3} />
        {/* A4 from manifest.md — an illustrative corporate-dashboard preview.
            Per client override of screens/03's "real product screenshots only"
            guardrail, this is a clearly illustrative mockup (no real figures) to
            be replaced by actual SafePass product screenshots before launch. */}
        <Reveal>
          <div className="relative overflow-hidden rounded-lg border border-border bg-surface-secondary">
            <Image
              src="/images/business-dashboard-preview.webp"
              alt="Preview of the SafePass corporate monitoring dashboard"
              width={2400}
              height={1500}
              sizes="(min-width: 1280px) 1200px, 100vw"
              className="h-auto w-full object-cover"
            />
          </div>
        </Reveal>

        {/* Numbered call-out legend for the dashboard — client feedback (annotate
            it the way Stripe does). A legend rather than overlay markers: the
            image is a placeholder mockup, so overlays could not be reliably
            positioned over real elements, and a legend survives the swap to a
            real screenshot. */}
        <Reveal>
          <ol className="grid gap-sm sm:grid-cols-2 lg:grid-cols-5">
            {CORPORATE_CONTENT.dashboardCallouts.map((callout, index) => (
              <li
                key={callout}
                className="flex items-center gap-sm rounded-md border border-border bg-surface-secondary px-md py-sm"
              >
                <span
                  aria-hidden="true"
                  className="flex size-(--size-icon-sm) shrink-0 items-center justify-center rounded-full bg-primary text-ink"
                >
                  <span className="font-mono text-caption font-semibold">{index + 1}</span>
                </span>
                <span className="text-body-small font-medium text-text-primary">{callout}</span>
              </li>
            ))}
          </ol>
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

      {/* "Suitable for organisations like…" — client feedback. Naming the
          industries a visitor recognises ("this is built for companies like
          ours") without claiming any of them as customers. */}
      <ContentSection
        heading={CORPORATE_CONTENT.suitableFor.heading}
        lead={CORPORATE_CONTENT.suitableFor.lead}
      >
        <Reveal>
          <ul className="flex flex-wrap gap-sm">
            {CORPORATE_CONTENT.suitableFor.industries.map((industry) => (
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

      {/* The comparison table — "why organisations choose SafePass". The most
          persuasive element on the page (client feedback). Two labelled columns,
          no figures: common ad-hoc practice versus a monitored journey. */}
      <ContentSection
        heading={CORPORATE_CONTENT.comparison.heading}
        lead={CORPORATE_CONTENT.comparison.lead}
      >
        <Reveal>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  <th scope="col" className="px-md py-sm text-body-small font-semibold text-text-primary">
                    How teams usually do it
                  </th>
                  <th scope="col" className="px-md py-sm text-body-small font-semibold text-text-primary">
                    With SafePass
                  </th>
                </tr>
              </thead>
              <tbody>
                {CORPORATE_CONTENT.comparison.rows.map((row) => (
                  <tr key={row.other} className="border-b border-border last:border-b-0">
                    <td className="flex items-center gap-xs px-md py-sm text-body text-text-secondary">
                      <X
                        aria-hidden="true"
                        className="size-(--size-icon-sm) shrink-0 text-text-secondary"
                        strokeWidth={2}
                      />
                      {row.other}
                    </td>
                    <td className="flex items-center gap-xs px-md py-sm text-body font-medium text-text-primary">
                      <span
                        aria-hidden="true"
                        className="flex size-(--size-icon-sm) shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
                      >
                        <Check className="size-(--size-icon-sm)" strokeWidth={2.5} />
                      </span>
                      {row.safepass}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </ContentSection>

      {/* Illustrative case study — client-requested ("nothing sells B2B software
          like numbers"). The figures are explicitly labelled as an example so
          they are never read as published SafePass operational data (R-007).
          Swap in real pilot numbers before treating this as evidence rather
          than illustration. */}
      <ContentSection
        eyebrow={CORPORATE_CONTENT.caseStudy.label}
        heading={CORPORATE_CONTENT.caseStudy.heading}
        lead={CORPORATE_CONTENT.caseStudy.org}
      >
        <Reveal>
          <dl className="grid gap-md sm:grid-cols-2 lg:grid-cols-4">
            {CORPORATE_CONTENT.caseStudy.metrics.map((metric) => (
              <div
                key={metric.label}
                className="flex flex-col gap-sm rounded-lg border border-border bg-surface-elevated p-lg"
              >
                <dt className="order-2 text-body text-text-secondary">{metric.label}</dt>
                <dd className="order-1 font-mono text-stat text-accent-text tabular-nums">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
        <Reveal>
          <p className="text-body-small text-text-secondary">
            {CORPORATE_CONTENT.caseStudy.note}
          </p>
        </Reveal>
      </ContentSection>

      {/* Assurance strip for procurement / legal — client-requested. Only the
          feature and behaviour items render; the legal-certification claims are
          gated behind `renderLegalCertifications` until counsel signs off (see
          IMPLEMENTATION.md §6a). */}
      <ContentSection
        heading={CORPORATE_CONTENT.assurance.heading}
        lead={CORPORATE_CONTENT.assurance.lead}
      >
        <Reveal>
          <ul className="flex flex-wrap gap-sm">
            {CORPORATE_CONTENT.assurance.items.map((item) => (
              <li key={item} className="flex items-center gap-xs">
                <span
                  aria-hidden="true"
                  className="flex size-(--size-icon-sm) shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
                >
                  <Check className="size-(--size-icon-sm)" strokeWidth={2.5} />
                </span>
                <span className="text-body font-medium text-text-primary">{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </ContentSection>

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
