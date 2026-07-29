import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge, taught this project's custom token names.
 *
 * THIS EXTENSION IS NOT OPTIONAL — without it, `cn()` silently deletes
 * typography.
 *
 * tailwind-merge resolves conflicts by classifying each utility into a group.
 * It only knows Tailwind's stock scales, so an unrecognised `text-*` utility is
 * assumed to be a text COLOUR. Our type scale is `text-h1`, `text-body`,
 * `text-stat` … and our colours are `text-text-primary`, `text-text-secondary`
 * — so tailwind-merge saw both as colours, decided they conflicted, and kept
 * only the last one:
 *
 *   twMerge('text-h1', 'text-text-primary')  →  'text-text-primary'
 *
 * The font size vanished. Every heading built through `cn()` rendered at 16px
 * body size with no error, no warning, and a passing test suite — the h1 on the
 * audience pages shipped at 16px/400 instead of 40px/700 and was caught only by
 * looking at the rendered page.
 *
 * Declaring the two groups explicitly puts each utility in the right bucket, so
 * a size and a colour no longer collide. ADD ANY NEW TYPE OR COLOUR TOKEN HERE
 * when you add it to `globals.css`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      /**
       * branding.md §3.3's 4px-grid scale. Registering it here makes every
       * spacing-derived group (padding, margin, gap, space-between, inset)
       * recognise our names at once.
       *
       * Without this, `cn('px-md', 'px-lg')` returned BOTH classes. They then
       * had equal specificity, so which one won came down to their order in the
       * generated stylesheet rather than the order the caller passed them —
       * meaning a component's `className` override silently failed to override
       * roughly half the time.
       */
      spacing: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'],
    },
    classGroups: {
      // Type scale from branding.md §3.2.
      'font-size': [
        {
          text: [
            'display',
            'h1',
            'h2',
            'h3',
            'body-large',
            'body',
            'body-small',
            'caption',
            'stat',
          ],
        },
      ],
      // Colour tokens from branding.md §3.1 that could otherwise be mistaken
      // for a size in the `text-*` namespace.
      'text-color': [
        {
          text: [
            'primary',
            'primary-hover',
            'primary-light',
            'surface',
            'surface-secondary',
            'surface-elevated',
            'text-primary',
            'text-secondary',
            'border',
            'success',
            'warning',
            'error',
            'info',
            'ink',
            'accent-text',
          ],
        },
      ],
    },
  },
});

/**
 * Merges class names, with later Tailwind utilities correctly overriding
 * earlier conflicting ones (`px-md` + `px-lg` → `px-lg`, not both).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats an ISO date (YYYY-MM-DD) for display next to a published statistic.
 *
 * Every stat on the credibility page renders its `asOfDate` visibly — see
 * risk_log.md R-007, where content staleness is scored High precisely because
 * a silently outdated "verified data" claim contradicts the thing it exists to
 * prove. Visible dating makes staleness self-evident to the reader instead of
 * depending on an internal review cadence nobody can see.
 */
export function formatAsOfDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;

  return new Intl.DateTimeFormat('en-NG', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
}
