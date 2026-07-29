import type { ReactNode } from 'react';
import { Reveal } from '@/components/motion/reveal';
import { Container, Section } from '@/components/ui/container';
import type { ContentCard } from '@/lib/content/audience-pages';
import { cn } from '@/lib/utils';

/**
 * Shared layout blocks for the three audience pages (FEAT-006, 009, 011).
 *
 * All three screens describe the same structural rhythm — a section heading
 * followed by a grid of short cards — with the same motion: `ease-out-smooth`
 * at `duration-normal`, triggered at the 82% viewport threshold, staggered
 * slightly between adjacent items. Building it once means the two B2B pages are
 * visually identical in pacing, which `screens/04` explicitly asks for ("for
 * visual system consistency across both B2B audience pages").
 *
 * `Reveal` animates opacity and transform over already-rendered DOM, so all of
 * this text is in the server HTML and readable before hydration.
 */

export function SectionHeading({
  eyebrow,
  heading,
  lead,
  as = 'h2',
}: {
  eyebrow?: string;
  heading: string;
  lead?: string;
  as?: 'h1' | 'h2';
}) {
  const Heading = as;

  return (
    <Reveal className="flex max-w-(--container-prose) flex-col gap-sm">
      {eyebrow && (
        <p className="text-caption uppercase tracking-wide text-accent-text">{eyebrow}</p>
      )}
      <Heading className={cn(as === 'h1' ? 'text-h1' : 'text-h2', 'text-text-primary')}>
        {heading}
      </Heading>
      {lead && <p className="text-body-large text-text-secondary">{lead}</p>}
    </Reveal>
  );
}

/**
 * Grid of short content cards.
 *
 * `columns` defaults to 2 — the two-up layout the use-case sections use. The
 * capability lists pass 3.
 */
export function ContentCardGrid({
  cards,
  columns = 2,
  className,
}: {
  cards: ReadonlyArray<ContentCard>;
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        'grid gap-md',
        columns === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3',
        className
      )}
    >
      {cards.map((card, index) => (
        <Reveal
          key={card.title}
          as="li"
          // Stagger by position so adjacent cards don't all arrive at once —
          // screens/03 asks for a slight offset between adjacent items on the
          // denser B2B sections.
          index={index}
          scale
          className="flex flex-col gap-sm rounded-lg border border-border bg-surface-secondary p-lg"
        >
          <h3 className="text-h3 text-text-primary">{card.title}</h3>
          <p className="text-body text-text-secondary">{card.body}</p>
        </Reveal>
      ))}
    </ul>
  );
}

/** Section wrapper pairing a heading with its body content. */
export function ContentSection({
  id,
  eyebrow,
  heading,
  lead,
  headingLevel,
  children,
  className,
}: {
  id?: string;
  eyebrow?: string;
  heading: string;
  lead?: string;
  headingLevel?: 'h1' | 'h2';
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Section id={id} className={className}>
      <Container className="flex flex-col gap-xl">
        <SectionHeading eyebrow={eyebrow} heading={heading} lead={lead} as={headingLevel} />
        {children}
      </Container>
    </Section>
  );
}

/**
 * Placeholder for imagery the screens specify but that does not exist yet.
 *
 * Both B2B screens are explicit that the missing assets must NOT be
 * AI-generated or invented — `screens/03` wants real corporate-dashboard
 * screenshots, and `screens/04` notes that "a fabricated fleet photo undermines
 * exactly the operational credibility Chidinma is evaluating". Both ask for a
 * labelled placeholder until real assets exist, which is what this renders.
 */
export function AssetPlaceholder({ label }: { label: string }) {
  return (
    <div
      className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border bg-surface-secondary p-lg"
      role="img"
      aria-label={label}
    >
      <p className="text-body-small text-text-secondary">{label}</p>
    </div>
  );
}
