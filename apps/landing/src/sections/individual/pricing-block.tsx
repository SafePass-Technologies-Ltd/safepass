import Link from 'next/link';
import { Check } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { Container, Section } from '@/components/ui/container';
import { INDIVIDUAL_CONTENT } from '@/lib/content/audience-pages';

/**
 * Pricing Block — FEAT-006, `screens/02-individual-traveller-page.md`.
 *
 * FEAT-006's first acceptance criterion is that pricing is stated "plainly and
 * prominently (no pricing hidden behind signup)", and the README's non-goals
 * forbid gating explainer content behind a signup wall. So this is server-
 * rendered, near the top of the page, and readable with JavaScript disabled.
 *
 * Reworked on client feedback to lead with value rather than price: the section
 * states the reassurance badges ("no subscription, pay per journey") before the
 * figure, then shows the "every monitored journey includes" box that reframes
 * ₦2,000 as a lot of value. The price is the last thing read, not the first.
 *
 * The figures use the monospace `stat` token per the screen's Motion
 * Choreography. They are rendered as literal text rather than counted up: the
 * shared `StatCallout` count-up belongs to the credibility module, where the
 * animation earns its place on a sourced data point. Animating a price adds
 * nothing a traveller deciding whether to spend ₦2,000 wants, and a
 * half-counted price is briefly a wrong price.
 */
export function PricingBlock() {
  const { pricing } = INDIVIDUAL_CONTENT;

  return (
    <Section id="pricing">
      <Container className="flex flex-col gap-xl">
        <Reveal className="flex max-w-(--container-prose) flex-col gap-sm">
          <h2 className="text-h2 text-text-primary">{pricing.heading}</h2>
          <p className="text-body-large text-text-secondary">{pricing.lead}</p>
        </Reveal>

        {/* Reassurance badges — answer the recurring-payment question before the
            visitor asks it. Each pairs an icon with the label; the icon is
            decorative, so it is aria-hidden and the label is the content. */}
        <Reveal>
          <ul className="flex flex-wrap gap-sm">
            {pricing.reassurances.map((reassurance) => (
              <li key={reassurance} className="flex items-center gap-xs">
                <span
                  aria-hidden="true"
                  className="flex size-(--size-icon-sm) items-center justify-center rounded-full bg-success/15 text-success"
                >
                  <Check className="size-(--size-icon-sm)" strokeWidth={2.5} />
                </span>
                <span className="text-body-small font-medium text-text-primary">{reassurance}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <ul className="grid gap-md md:grid-cols-2">
          {pricing.items.map((item, index) => (
            <Reveal
              key={item.label}
              as="li"
              index={index}
              scale
              className="flex flex-col gap-sm rounded-lg border border-border bg-surface-elevated p-lg"
            >
              <span className="font-mono text-stat text-accent-text tabular-nums">{item.value}</span>
              <span className="text-body font-medium text-text-primary">{item.label}</span>
              <span className="text-body-small text-text-secondary">{item.detail}</span>
            </Reveal>
          ))}
        </ul>

        {/* The value box: the "what you actually get for ₦2,000" reframe. Sits
            after the price cards so the visitor has read the figure but now has
            the substance beside it. */}
        <Reveal className="flex flex-col gap-md rounded-lg border border-border bg-surface-secondary p-lg">
          <h3 className="text-h3 text-text-primary">{pricing.includesHeading}</h3>
          <ul className="grid gap-sm sm:grid-cols-2">
            {pricing.includes.map((item) => (
              <li key={item} className="flex items-center gap-xs">
                <span
                  aria-hidden="true"
                  className="flex size-(--size-icon-sm) shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
                >
                  <Check className="size-(--size-icon-sm)" strokeWidth={2.5} />
                </span>
                <span className="text-body text-text-secondary">{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal className="flex flex-col gap-sm">
          <p className="text-body-small text-text-secondary">{pricing.footnote}</p>
          <Link
            href={INDIVIDUAL_CONTENT.credibilityLink.href}
            className="text-body font-medium text-accent-text underline underline-offset-4 hover:underline"
          >
            {INDIVIDUAL_CONTENT.credibilityLink.label}
          </Link>
        </Reveal>
      </Container>
    </Section>
  );
}
