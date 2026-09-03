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
  /**
   * Paragraphs rendered with emphasis (a visually stronger style). Used for a
   * single trust-critical sentence — e.g. "We do not sell your personal
   * information." — that a skimming reader must not miss.
   */
  emphasis?: string[];
  /** Optional bulleted list rendered after the paragraphs. */
  list?: string[];
  /**
   * Optional grouped lists rendered as visual cards, each group with its own
   * heading. Used when the information naturally splits into categories a
   * visitor should be able to skim independently (e.g. "information you
   * provide" vs "information collected automatically").
   */
  listGroups?: { heading: string; items: string[] }[];
  /** Rendered list marker style. Defaults to `disc`. */
  listStyle?: 'disc' | 'check';
  /**
   * Optional lucide icon keys, one per list item, rendered beside each item.
   * Used to give a short list (e.g. the "How We Are Different" pillars) a
   * visual anchor without making the section image-heavy. Length must match
   * the list; items without an icon simply render without one.
   */
  listIcons?: string[];
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
