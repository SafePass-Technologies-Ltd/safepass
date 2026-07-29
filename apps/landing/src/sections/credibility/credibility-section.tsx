import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container, Section } from '@/components/ui/container';
import { VerificationTierBadge } from '@/components/ui/verification-tier-badge';
import {
  CONTENT_REVIEW_NOTE,
  CREDIBILITY_INTRO,
  CREDIBILITY_LAYERS,
  CREDIBILITY_PREVIEW,
  VERIFICATION_TIERS,
} from '@/lib/content/credibility';
import { SAFETY_DATA_STATS, PREVIEW_STAT_ID, getStat } from '@/lib/content/safety-data-stats';
import { cn } from '@/lib/utils';
import { StatCallout } from './stat-callout';

/**
 * Credibility & Safety-Data module — FEAT-005, `screens/05-credibility-page.md`.
 *
 * ONE MODULE, FOUR PLACEMENTS. screens.md's Cross-Screen Notes require this
 * content render identically whether reached standalone at `/how-we-verify` or
 * embedded in the Homepage, Corporate, or Transport Partner page — so it lives
 * here and is imported, never restated. Duplicating the copy into a page would
 * reintroduce exactly the drift R-007 is about.
 *
 * SERVER COMPONENT, and it must stay one. FEAT-005 requires the content be
 * "fully readable and indexable by search engines (not gated behind
 * interaction-only reveal)", and screens/05 makes crawlability this page's
 * primary technical requirement. The body copy therefore has NO entrance
 * animation at all — the only motion on this module is the stat count-up,
 * which animates a value that is already in the HTML (see `StatCallout`).
 */

function VerificationTierList() {
  return (
    <ul className="flex flex-col gap-md">
      {VERIFICATION_TIERS.map((tier) => (
        <li
          key={tier.label}
          className="flex flex-col gap-sm rounded-md border border-border bg-surface-secondary p-md sm:flex-row sm:items-start sm:gap-lg"
        >
          <div className="sm:w-[220px] sm:shrink-0">
            {tier.badgeTier ? (
              <VerificationTierBadge tier={tier.badgeTier} />
            ) : (
              // `rejected` has no badge variant: it is never surfaced as a live
              // trust signal, so it is rendered as a plain label rather than
              // inventing a fifth badge the design system doesn't define.
              <span className="inline-flex items-center rounded-full border border-border bg-surface px-sm py-xs text-caption font-medium uppercase tracking-wide text-text-secondary">
                {tier.label}
              </span>
            )}
          </div>
          <p className="text-body text-text-secondary">{tier.description}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * The full module: intro, the three-layer cold-start strategy, the
 * verification-tier system, sourced stat call-outs, and the content-review
 * commitment.
 *
 * `headingLevel` lets an embedding page keep a sane document outline — the
 * standalone page owns the `h1`, so embeds render the module heading as `h2`.
 */
export function CredibilitySection({
  className,
  id = 'credibility',
  headingLevel = 'h2',
  showIntroHeading = true,
}: {
  className?: string;
  id?: string;
  headingLevel?: 'h1' | 'h2';
  showIntroHeading?: boolean;
}) {
  const Heading = headingLevel;
  const subHeadingClass = headingLevel === 'h1' ? 'text-h2' : 'text-h3';

  return (
    <Section id={id} className={className}>
      <Container className="flex flex-col gap-2xl">
        {showIntroHeading && (
          <header className="flex max-w-[70ch] flex-col gap-md">
            <p className="text-caption uppercase tracking-wide text-accent-text">
              {CREDIBILITY_INTRO.eyebrow}
            </p>
            <Heading
              className={cn(
                'text-text-primary',
                headingLevel === 'h1' ? 'text-h1 md:text-display' : 'text-h2'
              )}
            >
              {CREDIBILITY_INTRO.heading}
            </Heading>
            {CREDIBILITY_INTRO.lead.map((paragraph) => (
              <p key={paragraph} className="text-body-large text-text-secondary">
                {paragraph}
              </p>
            ))}
          </header>
        )}

        {/* Stat call-outs — every one carries a visible source and as-of date. */}
        <div className="grid gap-lg sm:grid-cols-2">
          {SAFETY_DATA_STATS.map((stat) => (
            <StatCallout key={stat.statId} stat={stat} />
          ))}
        </div>

        <div className="flex flex-col gap-xl">
          <h2 className={cn(subHeadingClass, 'text-text-primary')}>
            Building the map: a three-layer strategy
          </h2>

          {CREDIBILITY_LAYERS.map((layer) => (
            <article key={layer.id} id={layer.id} className="flex max-w-[70ch] flex-col gap-sm">
              <p className="text-caption uppercase tracking-wide text-accent-text">{layer.eyebrow}</p>
              <h3 className="text-h3 text-text-primary">{layer.heading}</h3>
              {layer.body.map((paragraph) => (
                <p key={paragraph} className="text-body text-text-secondary">
                  {paragraph}
                </p>
              ))}
              <ul className="mt-sm flex list-disc flex-col gap-xs pl-lg text-body text-text-secondary">
                {layer.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="flex flex-col gap-lg">
          <h2 className={cn(subHeadingClass, 'text-text-primary')}>
            How much a single report counts
          </h2>
          <p className="max-w-[70ch] text-body text-text-secondary">
            Every marker on the SafePass map carries one of these five classifications. Each pairs a
            colour with an icon and a written label, so the classification never depends on colour
            alone.
          </p>
          <VerificationTierList />
        </div>

        <p className="max-w-[70ch] text-body-small text-text-secondary">{CONTENT_REVIEW_NOTE}</p>
      </Container>
    </Section>
  );
}

/**
 * Compact preview variant — the Homepage's "Credibility Preview" and the
 * equivalent embed on the two B2B audience pages.
 *
 * Same content model, same source of truth, condensed: one headline, one
 * summary, the tier labels, one sourced stat, and the link through to the full
 * methodology. Nothing here states anything the full module doesn't.
 */
export function CredibilityPreview({
  className,
  id = 'credibility',
  statId = PREVIEW_STAT_ID,
}: {
  className?: string;
  id?: string;
  statId?: string;
}) {
  const stat = getStat(statId);

  return (
    <Section id={id} className={className}>
      <Container className="grid items-start gap-xl md:grid-cols-2">
        <div className="flex flex-col gap-md">
          <p className="text-caption uppercase tracking-wide text-accent-text">
            {CREDIBILITY_INTRO.eyebrow}
          </p>
          <h2 className="text-h2 text-text-primary">{CREDIBILITY_PREVIEW.heading}</h2>
          <p className="text-body-large text-text-secondary">{CREDIBILITY_PREVIEW.lead}</p>

          <ul className="flex flex-wrap gap-sm">
            {VERIFICATION_TIERS.filter((tier) => tier.badgeTier).map((tier) => (
              <li key={tier.label}>
                <VerificationTierBadge tier={tier.badgeTier!} />
              </li>
            ))}
          </ul>

          <Link
            href={CREDIBILITY_PREVIEW.linkHref}
            className="inline-flex items-center gap-xs text-body font-semibold text-accent-text hover:underline"
          >
            {CREDIBILITY_PREVIEW.linkLabel}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <StatCallout stat={stat} />
      </Container>
    </Section>
  );
}
