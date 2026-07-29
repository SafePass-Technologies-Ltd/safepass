import type { Metadata } from 'next';
import { Container } from '@/components/ui/container';
import { CORPORATE_CONTENT } from '@/lib/content/audience-pages';
import { INDIVIDUAL_CONTENT } from '@/lib/content/audience-pages';
import { clientEnv } from '@/lib/env';

/**
 * SafePass one-page corporate overview — FEAT-009's downloadable asset.
 *
 * A print-optimised page rather than a designed PDF: see the reasoning in
 * `sections/corporate/overview-download.tsx`. Everything here is drawn from the
 * same sourced content module the `/business` page uses, so the overview Tunde
 * forwards internally can never drift from what the site says — which is
 * exactly the failure a separately-maintained PDF invites.
 *
 * Deliberately excluded from search indexing: it is a duplicate of `/business`
 * in content terms, and letting it compete for the same queries would split the
 * page authority FEAT-013 is trying to build.
 */

export const metadata: Metadata = {
  title: 'SafePass — corporate overview',
  description: 'One-page overview of SafePass monitored road travel for organisations.',
  robots: { index: false, follow: false },
};

export default function BusinessOverviewPage() {
  return (
    <Container width="prose" className="flex flex-col gap-xl py-2xl print:py-0">
      <header className="flex flex-col gap-sm border-b border-border pb-lg">
        <p className="text-caption uppercase tracking-wide text-accent-text">SafePass for business</p>
        <h1 className="text-h1 text-text-primary">{CORPORATE_CONTENT.heading}</h1>
        <p className="text-body-large text-text-secondary">{CORPORATE_CONTENT.lead}</p>
      </header>

      <section className="flex flex-col gap-md">
        <h2 className="text-h2 text-text-primary">Where organisations use it</h2>
        <dl className="flex flex-col gap-md">
          {CORPORATE_CONTENT.useCases.map((useCase) => (
            <div key={useCase.title} className="flex flex-col gap-xs">
              <dt className="text-h3 text-text-primary">{useCase.title}</dt>
              <dd className="text-body text-text-secondary">{useCase.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-md">
        <h2 className="text-h2 text-text-primary">{CORPORATE_CONTENT.dashboard.heading}</h2>
        <ul className="flex flex-col gap-sm">
          {CORPORATE_CONTENT.dashboard.capabilities.map((capability) => (
            <li key={capability.title} className="text-body text-text-secondary">
              <span className="font-semibold text-text-primary">{capability.title}</span> —{' '}
              {capability.body}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-md">
        <h2 className="text-h2 text-text-primary">{CORPORATE_CONTENT.dataPosture.heading}</h2>
        <ul className="flex flex-col gap-sm">
          {CORPORATE_CONTENT.dataPosture.points.map((point) => (
            <li key={point.title} className="text-body text-text-secondary">
              <span className="font-semibold text-text-primary">{point.title}</span> — {point.body}
            </li>
          ))}
        </ul>
        <p className="text-body-small text-text-secondary">
          {CORPORATE_CONTENT.dataPosture.policyNote}
        </p>
      </section>

      <section className="flex flex-col gap-md">
        <h2 className="text-h2 text-text-primary">What it costs</h2>
        <p className="text-body text-text-secondary">
          Individual monitored journeys are {INDIVIDUAL_CONTENT.pricing.items[0].value} each,
          deducted from a funded wallet. Organisation-level plans are quoted against how many people
          travel and how often — request a demo and we will be specific.
        </p>
      </section>

      <footer className="flex flex-col gap-xs border-t border-border pt-lg">
        <h2 className="text-h3 text-text-primary">Next step</h2>
        <p className="text-body text-text-secondary">
          Request a demo at {clientEnv.siteUrl}/business, or email{' '}
          {clientEnv.fallbackContactEmail}.
        </p>
        <p className="text-body-small text-text-secondary">
          SafePass — {`Every Journey Matters.`}
        </p>
      </footer>
    </Container>
  );
}
