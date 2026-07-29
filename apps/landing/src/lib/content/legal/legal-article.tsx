import Link from 'next/link';
import type { LegalDocument } from './types';

/**
 * Renderer for the Standard Static Page Layout body (screens.md) — FEAT-015.
 *
 * Deliberately NOT Creative-tier: screens.md states that "a legal disclosure
 * page has no experience worth applying motion to", so there is no Reveal, no
 * scroll binding, and no client boundary here. This is a plain Server
 * Component and the whole page is readable before any JavaScript runs.
 *
 * It renders no Container, Navbar, or Footer — `app/(legal)/layout.tsx`
 * already supplies the non-audience Navbar, the 800px prose column, and the
 * Footer for all three pages.
 *
 * WHY THIS LIVES UNDER lib/content/legal/ rather than components/ui/:
 * it is the presentation half of this module's content model, has exactly
 * three callers, and all three are owned by this feature slice. Promoting it
 * to the shared `components/ui/` surface is a reasonable follow-up once
 * something outside FEAT-015 needs article typography.
 */
export function LegalArticle({ document: doc }: { document: LegalDocument }) {
  const needsReview = doc.sections.some((section) => section.needsLegalReview);

  return (
    <article className="py-2xl md:py-3xl">
      <h1 className="text-h1 text-text-primary">{doc.title}</h1>

      <p className="mt-sm text-body-small text-text-secondary">
        Last updated:{' '}
        <time dateTime={doc.lastUpdated}>{formatLastUpdated(doc.lastUpdated)}</time>
      </p>

      {needsReview ? <LegalReviewNotice /> : null}

      <div className="mt-xl flex flex-col gap-md">
        {doc.intro.map((paragraph) => (
          <p key={paragraph} className="text-body-large text-text-primary">
            {paragraph}
          </p>
        ))}
      </div>

      {doc.showTableOfContents ? <TableOfContents document={doc} /> : null}

      {doc.sections.map((section) => (
        <section key={section.id} id={section.id} className="mt-2xl scroll-mt-3xl">
          <h2 className="text-h2 text-text-primary">{section.heading}</h2>

          {section.body.map((paragraph) => (
            <p key={paragraph} className="mt-md text-body text-text-secondary">
              {paragraph}
            </p>
          ))}

          {section.list ? (
            <ul className="mt-md flex list-disc flex-col gap-sm pl-lg text-body text-text-secondary">
              {section.list.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      <nav aria-label="Related pages" className="mt-3xl border-t border-border pt-xl">
        <ul className="flex flex-wrap gap-lg">
          {doc.relatedLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                // Padding, not a fixed height: these are inline text links
                // inside prose, and the block gets them past the 44px touch
                // target floor without breaking the reading rhythm
                // (branding.md §4).
                className="-mx-sm inline-flex min-h-[44px] items-center rounded-sm px-sm text-body font-semibold text-accent-text hover:underline"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}

/**
 * In-page anchor list — screens/06 specifies one at the top of longer
 * documents so a visitor can jump to the section they came for (typically
 * Tunde, checking data handling before submitting company information).
 */
function TableOfContents({ document: doc }: { document: LegalDocument }) {
  return (
    <nav aria-label="On this page" className="mt-xl rounded-md bg-surface-secondary p-lg">
      <h2 className="text-caption uppercase tracking-wide text-text-secondary">On this page</h2>
      <ul className="mt-md flex flex-col gap-xs">
        {doc.sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="-mx-sm inline-flex min-h-[44px] items-center rounded-sm px-sm text-body text-accent-text hover:underline"
            >
              {section.heading}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Shown while any section is still placeholder prose awaiting counsel.
 *
 * Presenting unreviewed text as a binding policy would be worse than saying so
 * plainly — and R-011's contingency is precisely "take lead-capture forms
 * offline if a compliance gap is identified", so the gap must be visible.
 * Delete this by clearing the `needsLegalReview` flags once the copy is
 * approved; there is nothing to change in this component.
 */
function LegalReviewNotice() {
  return (
    <p
      role="note"
      className="mt-lg rounded-md border border-warning bg-surface-secondary p-lg text-body-small text-text-primary"
    >
      <strong className="font-semibold">This document is being finalised.</strong> The sections and
      headings below are complete, but the wording is still under legal review and is provided for
      information only. Contact us if you need the reviewed version before it is published here.
    </p>
  );
}

/** ISO date to a readable, unambiguous form — "27 July 2026", never "07/27". */
function formatLastUpdated(isoDate: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}
