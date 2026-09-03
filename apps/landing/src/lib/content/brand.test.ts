import { describe, expect, it } from 'vitest';
import { PLATFORM_POSITION } from './brand';

/**
 * The Road Journey Assurance Platform positioning — the category SafePass owns.
 *
 * The category name is the single thing that must not drift: it appears as the
 * homepage hero eyebrow and as the audience-page eyebrows, so a typo here
 * silently produces a site with two different category names. The assertions
 * pin the exact string, and the two-sided promise keeps the individual and
 * business pages telling the same story from their own angle.
 */
describe('PLATFORM_POSITION', () => {
  it('owns the Road Journey Assurance Platform category, spelled exactly', () => {
    expect(PLATFORM_POSITION.category).toBe('Road Journey Assurance Platform');
  });

  it('names a single-word promise', () => {
    expect(PLATFORM_POSITION.promise).toBe('certainty');
  });

  it('states the promise in one sentence', () => {
    expect(PLATFORM_POSITION.statement.length).toBeGreaterThan(0);
    expect(PLATFORM_POSITION.statement).toMatch(/someone knows where you are|someone knows where i am/i);
  });

  it('articulates the individual and business promises distinctly', () => {
    expect(PLATFORM_POSITION.promises.individual).toMatch(/someone knows where i am/i);
    expect(PLATFORM_POSITION.promises.business).toMatch(/duty of care/i);
  });
});
