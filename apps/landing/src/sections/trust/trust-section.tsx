import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Container, Section } from '@/components/ui/container';
import { Reveal } from '@/components/motion/reveal';
import { TRUST } from '@/lib/content/trust';

/**
 * Homepage trust section — "Trusted by people travelling Nigeria's roads".
 *
 * A SERVER Component, so every principle and link ships in the initial HTML.
 * The principles are not statistics, so nothing here needs a source or an as-of
 * date (R-007) — but if a number is ever added it must go through the same
 * sourcing discipline as the credibility module.
 *
 * Placed immediately after the hero, per client feedback: the homepage should
 * first answer "why does this exist" and "can I trust it", before the visitor
 * reaches the price. This is the trust layer; FEAT-005's credibility module
 * (further down the page) is the proof layer.
 *
 * Content lives in `lib/content/trust.ts` (typed data), so a copy edit never
 * touches this component — the same separation the rest of the site uses.
 */
export function TrustSection() {
  return (
    <Section className="border-b border-border bg-surface-secondary">
      <Container className="flex flex-col gap-xl">
        <Reveal className="flex max-w-[70ch] flex-col gap-md">
          <p className="text-caption uppercase tracking-wide text-accent-text">
            {TRUST.eyebrow}
          </p>
          <h2 className="text-h2 text-text-primary">{TRUST.heading}</h2>
          <p className="text-body-large text-text-secondary">{TRUST.lead}</p>
        </Reveal>

        {/*
          The principle list is a plain list — the check mark is decorative, and
          the label is the real content, so a screen reader hears the principle
          itself, never "check, human monitored journeys". Pairs the icon with
          the text (branding.md accessibility), never colour alone.
        */}
        <ul className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
          {TRUST.principles.map((principle, index) => (
            <Reveal
              as="li"
              key={principle}
              index={index}
              className="flex items-start gap-sm rounded-md border border-border bg-surface-elevated p-md"
            >
              <span
                aria-hidden="true"
                className="mt-xs flex size-(--size-icon-sm) shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
              >
                <Check className="size-(--size-icon-sm)" strokeWidth={2.5} />
              </span>
              <span className="text-body font-medium text-text-primary">{principle}</span>
            </Reveal>
          ))}
        </ul>

        {/*
          The transparency strip: three links that together tell a visitor the
          site is open about how it works. Accessibility-wise this is a real
          `nav` landmark with an aria-label that describes its purpose.
        */}
        <Reveal>
          <nav
            aria-label="Transparency"
            className="flex flex-wrap gap-x-xl gap-y-sm border-t border-border pt-lg"
          >
            {TRUST.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group inline-flex items-center gap-xs text-body-small font-semibold text-accent-text transition-colors duration-[var(--duration-instant)] ease-out-smooth hover:text-text-primary"
              >
                {link.label}
                <ArrowRight
                  aria-hidden="true"
                  className="size-(--size-icon-sm) transition-transform duration-[var(--duration-instant)] ease-out-smooth group-hover:translate-x-1"
                />
              </Link>
            ))}
          </nav>
        </Reveal>
      </Container>
    </Section>
  );
}
