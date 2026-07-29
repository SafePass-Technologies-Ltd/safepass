import { FileText } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { ButtonLink } from '@/components/ui/button';
import { Container, Section } from '@/components/ui/container';
import { CORPORATE_CONTENT } from '@/lib/content/audience-pages';

/**
 * Downloadable Overview card — FEAT-009's third acceptance criterion ("a
 * downloadable overview asset (PDF or equivalent) that Tunde can save/forward
 * internally").
 *
 * WHY THIS LINKS TO A PAGE RATHER THAN SERVING A PDF FILE.
 *
 * No designed PDF exists in the repo, and none is listed as a deliverable in
 * any screen's Asset Plan. The options were: ship a card whose download 404s,
 * omit the card and fail the acceptance criterion, or satisfy the criterion's
 * own "or equivalent" with a print-optimised page the visitor saves as a PDF
 * from the browser. The third is the only one that leaves Tunde able to
 * actually forward something internally, which is what the criterion is for.
 *
 * The deviation from `screens/03`'s Interactive Behavior is deliberate and
 * narrow: that doc specifies "a direct file download (no new tab/page)". This
 * opens `/business-overview` in a new tab instead — flagged for the docs, and a
 * one-line change to `href`/`download` the moment a real PDF exists.
 */
export function OverviewDownload() {
  const { overview } = CORPORATE_CONTENT;

  return (
    <Section>
      <Container>
        <Reveal
          scale
          className="flex flex-col items-start gap-md rounded-lg border border-border bg-surface-elevated p-lg shadow-sm md:flex-row md:items-center md:justify-between"
        >
          <div className="flex items-start gap-md">
            <FileText
              aria-hidden="true"
              strokeWidth={1.75}
              className="mt-xs size-(--size-icon-lg) shrink-0 text-primary"
            />
            <div className="flex flex-col gap-xs">
              <h2 className="text-h3 text-text-primary">{overview.heading}</h2>
              <p className="text-body text-text-secondary">{overview.body}</p>
            </div>
          </div>

          <ButtonLink
            href="/business-overview"
            variant="secondary"
            external
            className="shrink-0"
            // FEAT-014 (Phase 2) tracks this as an engagement signal — Tunde's
            // multi-visit pattern means the download often precedes the form
            // submission by days. The hook is here so that slice is a listener,
            // not a component change.
            data-analytics-event="corporate_overview_download"
          >
            {overview.ctaLabel}
          </ButtonLink>
        </Reveal>
      </Container>
    </Section>
  );
}
