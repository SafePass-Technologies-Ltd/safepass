import Link from 'next/link';
import { Check, Eye, MapPin, Radar, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { LegalDocument } from './types';
import { cn } from '@/lib/utils';

/**
 * Icon keys usable in `LegalSection.listIcons`. Kept as a map rather than
 * importing lucide into the content module, so the copy stays dependency-free
 * and the icon choice lives with the renderer.
 */
const LIST_ICONS: Record<string, LucideIcon> = {
  navigation: MapPin,
  human: Eye,
  intelligence: Radar,
  evidence: ShieldCheck,
};

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

      {needsReview ? <LegalReviewNotice title={doc.title} /> : null}

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

          {section.emphasis?.map((paragraph) => (
            <p
              key={paragraph}
              className="mt-md rounded-md border border-border bg-surface-elevated p-lg text-body font-semibold text-text-primary"
            >
              {paragraph}
            </p>
          ))}

          {section.listGroups ? (
            <div className="mt-lg grid gap-md md:grid-cols-2">
              {section.listGroups.map((group) => (
                <div
                  key={group.heading}
                  className="rounded-md border border-border bg-surface-secondary p-lg"
                >
                  <h3 className="text-caption uppercase tracking-wide text-text-secondary">
                    {group.heading}
                  </h3>
                  <ul className="mt-md flex list-disc flex-col gap-sm pl-lg text-body text-text-secondary">
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : section.list ? (
            <ul
              className={cn(
                'mt-md flex flex-col gap-sm text-body text-text-secondary',
                section.listStyle === 'check' || section.listIcons
                  ? 'pl-0 [list-style:none]'
                  : 'list-disc pl-lg'
              )}
            >
              {section.list.map((item, index) => {
                const Icon = section.listIcons ? LIST_ICONS[section.listIcons[index]] : undefined;

                return (
                  <li
                    key={item}
                    className={
                      section.listStyle === 'check' || Icon
                        ? 'flex items-start gap-xs'
                        : undefined
                    }
                  >
                    {section.listStyle === 'check' && (
                      <span
                        aria-hidden="true"
                        className="mt-xs flex size-(--size-icon-sm) shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
                      >
                        <Check className="size-(--size-icon-sm)" strokeWidth={2.5} />
                      </span>
                    )}
                    {Icon && (
                      <span
                        aria-hidden="true"
                        className="mt-xs flex size-(--size-icon-lg) shrink-0 items-center justify-center rounded-md bg-primary-light text-accent-text"
                      >
                        <Icon className="size-(--size-icon-md)" strokeWidth={2} />
                      </span>
                    )}
                    <span>{item}</span>
                  </li>
                );
              })}
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
 * Presenting unreviewed text as a binding document would be worse than saying
 * so plainly — and R-011's contingency is precisely "take lead-capture forms
 * offline if a compliance gap is identified", so the gap must be visible.
 * The wording is deliberately confidence-inspiring (client feedback across the
 * legal pages: "the lawyers are polishing something already complete", not
 * "this isn't finished") while still stating that final legal review is
 * ongoing. Delete this by clearing the `needsLegalReview` flags once the copy
 * is approved; there is nothing to change in this component.
 *
 * Uses the document's own title so the same notice is correct on both the
 * Privacy Policy and Terms of Service pages — it must never hardcode one
 * document's name.
 */
function LegalReviewNotice({ title }: { title: string }) {
  return (
    <p
      role="note"
      className="mt-lg rounded-md border border-warning bg-surface-secondary p-lg text-body-small text-text-primary"
    >
      <strong className="font-semibold">
        {title} is currently undergoing final legal review.
      </strong>{' '}
      The principles, scope and obligations described below are substantially complete and reflect
      how SafePass operates today. Any future revisions are expected to clarify legal wording rather
      than change these commitments. Contact us if you need the reviewed version before it is
      published here.
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
