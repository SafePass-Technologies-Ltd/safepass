import { CircleCheck, Eye, Route, ShieldAlert, Wallet, type LucideIcon } from 'lucide-react';
import { Container, Section } from '@/components/ui/container';
import { Reveal } from '@/components/motion/reveal';
import { HOW_IT_WORKS, type HowItWorksIcon } from '@/lib/content/how-it-works';

/**
 * How It Works explainer — FEAT-004, `screens/01-homepage.md`.
 *
 * A SERVER Component; only the per-step `Reveal` wrapper is client-side, and
 * `Reveal` animates opacity/transform on content that is already in the DOM.
 * That matters here more than anywhere else on the page: this section IS the
 * answer to Flow 1's Alternate Path C (Amaka skims, finds no plain mechanical
 * explanation, and leaves). If the explanation only appears after a successful
 * scroll-triggered reveal, the visitor most at risk of bouncing — slow network,
 * JavaScript still loading — is exactly the one who never sees it.
 *
 * Design intent, from branding.md §7's Illustration Direction: geometric line
 * art at 2px stroke, monochrome in `text-secondary`/`primary`. Lucide icons at
 * `strokeWidth={2}` are that style (the Asset Plan names Lucide directly, so no
 * asset sourcing is required for this section).
 */

/**
 * Icon key → component. The mapping lives here rather than in the content
 * module so the copy stays a plain, dependency-free data file.
 */
const ICONS: Record<HowItWorksIcon, LucideIcon> = {
  route: Route,
  wallet: Wallet,
  eye: Eye,
  check: CircleCheck,
  alert: ShieldAlert,
};

export function HowItWorksSection() {
  return (
    <Section id="how-it-works" className="bg-surface">
      <Container>
        <Reveal>
          <p className="text-caption font-medium tracking-widest text-accent-text uppercase">
            {HOW_IT_WORKS.eyebrow}
          </p>
          <h2 className="mt-md text-h2 text-text-primary">{HOW_IT_WORKS.heading}</h2>
          <p className="mt-sm text-body-large text-text-secondary">{HOW_IT_WORKS.intro}</p>
        </Reveal>

        {/*
          An ordered list, because the order is load-bearing — the steps are a
          sequence a journey passes through, and a screen reader should announce
          it as "1 of 5", not as five unrelated cards.
        */}
        <ol className="mt-2xl grid gap-lg md:grid-cols-2 lg:grid-cols-3">
          {HOW_IT_WORKS.steps.map((step, index) => {
            const Icon = ICONS[step.icon];

            return (
              <Reveal
                as="li"
                key={step.id}
                index={index}
                scale
                className="rounded-lg border border-border bg-surface-elevated p-lg shadow-sm"
              >
                <div className="flex items-center gap-md">
                  <span
                    aria-hidden="true"
                    className="flex size-(--size-icon-lg) shrink-0 items-center justify-center rounded-full bg-primary-light text-accent-text"
                  >
                    <Icon className="size-(--size-icon-md)" strokeWidth={2} />
                  </span>
                  {/* The step number is content, not decoration — it is how the
                      section reads as a sequence when skimmed in a few seconds. */}
                  <span className="font-mono text-body-small text-text-secondary">
                    Step {index + 1}
                  </span>
                </div>

                <h3 className="mt-md text-h3 text-text-primary">{step.title}</h3>
                <p className="mt-sm text-body text-text-secondary">{step.body}</p>
              </Reveal>
            );
          })}
        </ol>

        <Reveal>
          <p className="mt-xl max-w-(--container-prose) text-body text-text-secondary">
            {HOW_IT_WORKS.footnote}
          </p>
        </Reveal>
      </Container>
    </Section>
  );
}
