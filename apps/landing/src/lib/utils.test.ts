import { describe, expect, it } from 'vitest';
import { cn, formatAsOfDate } from './utils';

/**
 * Regression guard for a bug that shipped invisibly.
 *
 * tailwind-merge classifies unknown `text-*` utilities as colours. Our type
 * scale (`text-h1`) and our colour tokens (`text-text-primary`) therefore both
 * looked like colours, "conflicted", and the size was dropped — rendering every
 * `cn()`-built heading at 16px body size. Lint, 200+ unit tests, and the
 * production build all passed; only a browser showed it.
 *
 * These assertions exist so that adding a type token to globals.css without
 * registering it in `cn()`'s extension fails here rather than in production.
 */
describe('cn — type scale and colour must not be treated as conflicting', () => {
  it.each([
    ['text-display', 'text-text-primary'],
    ['text-h1', 'text-text-primary'],
    ['text-h2', 'text-text-primary'],
    ['text-h3', 'text-text-secondary'],
    ['text-body-large', 'text-text-secondary'],
    ['text-body', 'text-text-primary'],
    ['text-body-small', 'text-text-secondary'],
    ['text-caption', 'text-primary'],
    ['text-stat', 'text-primary'],
  ])('keeps both %s and %s', (size, color) => {
    const result = cn(size, color);
    expect(result).toContain(size);
    expect(result).toContain(color);
  });

  it('still collapses genuinely conflicting sizes', () => {
    expect(cn('text-h1', 'text-h2')).toBe('text-h2');
  });

  it('still collapses genuinely conflicting colours', () => {
    expect(cn('text-text-primary', 'text-text-secondary')).toBe('text-text-secondary');
  });

  it.each([
    ['px-md', 'px-lg'],
    ['p-md', 'p-lg'],
    ['gap-sm', 'gap-lg'],
    ['mt-xl', 'mt-3xl'],
  ])('collapses conflicting custom spacing %s + %s', (first, second) => {
    // Both surviving would leave the winner decided by stylesheet order rather
    // than by the caller's argument order, so a component `className` override
    // would silently fail.
    expect(cn(first, second)).toBe(second);
  });

  it('preserves an explicit override of a component default', () => {
    // The pattern every component relies on: base classes first, caller's
    // `className` last.
    expect(cn('text-body text-text-secondary', 'text-h3')).toBe('text-text-secondary text-h3');
  });
});

describe('formatAsOfDate', () => {
  it('renders a readable month and year for a published stat', () => {
    expect(formatAsOfDate('2026-07-27')).toMatch(/July 2026/);
  });

  it('returns the raw value rather than "Invalid Date" when unparseable', () => {
    // A stat's date is a credibility signal (R-007); showing "Invalid Date"
    // next to a safety figure would be worse than showing the raw string.
    expect(formatAsOfDate('not-a-date')).toBe('not-a-date');
  });
});
