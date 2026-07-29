/**
 * Typed content model for the Standard Static Page Layout pages
 * (Privacy Policy, Terms of Service, About) — FEAT-015.
 *
 * Copy lives here as data rather than inline in JSX, per IMPLEMENTATION.md §4,
 * so FEAT-016 (CMS-backed authoring) is a data-source swap rather than a
 * rewrite of three pages.
 */

export interface LegalSection {
  /** Anchor id — also the target of the in-page navigation list. */
  id: string;
  /** Rendered as an `h2`. */
  heading: string;
  /** Body paragraphs, in order. */
  body: string[];
  /** Optional bulleted list rendered after the paragraphs. */
  list?: string[];
  /**
   * True when the prose above is placeholder text standing in for copy that a
   * Nigerian-qualified lawyer must write or approve before launch. The page
   * renders a visible notice while any section carries this flag — a legal
   * page that silently presents unreviewed prose as binding is worse than one
   * that says so.
   */
  needsLegalReview?: boolean;
}

export interface LegalRelatedLink {
  href: string;
  label: string;
}

export interface LegalDocument {
  /** Rendered as the `h1`. */
  title: string;
  /** Used for the page `metadata.description`. */
  description: string;
  /** ISO date, rendered as the "Last updated" line. Updated by hand. */
  lastUpdated: string;
  /** Lead paragraphs shown before the first section. */
  intro: string[];
  sections: LegalSection[];
  /** Cross-links matching the screen's documented Exit Points. */
  relatedLinks: LegalRelatedLink[];
  /** Show the in-page anchor list (screens/06 specifies one for long docs). */
  showTableOfContents: boolean;
}
