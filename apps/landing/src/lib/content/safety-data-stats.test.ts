import { describe, expect, it } from 'vitest';
import { SafetyDataStatSchema } from '@safepass/shared';
import { SAFETY_DATA_STATS, PREVIEW_STAT_ID, getStat } from './safety-data-stats';

/**
 * FEAT-005 — "All data claims include a source/methodology footnote", and
 * risk_log.md R-007 (content staleness).
 *
 * The last test here is the important one. FEAT-005's whole point is that the
 * site publishes verifiable content instead of marketing claims, and SafePass
 * has no published operational data yet — so an invented corridor count or
 * incident total is the single worst thing that could land in this file. The
 * guard is deliberately blunt: it fails on the vocabulary of fabricated
 * operational metrics, so adding one requires deleting a test rather than
 * quietly slipping past review.
 */

describe('safety data stats', () => {
  it('every published stat satisfies the shared schema', () => {
    for (const stat of SAFETY_DATA_STATS) {
      expect(() => SafetyDataStatSchema.parse(stat)).not.toThrow();
    }
  });

  it('every stat carries a non-empty source and an as-of date', () => {
    expect(SAFETY_DATA_STATS.length).toBeGreaterThan(0);

    for (const stat of SAFETY_DATA_STATS) {
      expect(stat.source.trim().length).toBeGreaterThan(0);
      expect(stat.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(stat.asOfDate))).toBe(false);
    }
  });

  it('stat ids are unique, so the preview and full page cannot drift', () => {
    const ids = SAFETY_DATA_STATS.map((stat) => stat.statId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the preview stat id resolves', () => {
    expect(getStat(PREVIEW_STAT_ID).statId).toBe(PREVIEW_STAT_ID);
  });

  it('getStat throws on an unknown id rather than rendering nothing', () => {
    expect(() => getStat('does-not-exist')).toThrow();
  });

  it('publishes no unverifiable operational metric', () => {
    const forbidden = [
      /corridors? (mapped|covered)/i,
      /incidents? (reported|resolved|prevented)/i,
      /response time/i,
      /safe[- ]arrival/i,
      // "user confirmations" is methodology and is allowed; a *count* of users
      // is an operational metric and is not.
      /(registered|active|total|\d+)\s+users?/i,
      /journeys? monitored/i,
      /monitored journeys/i,
      /coverage/i,
      /uptime/i,
    ];

    for (const stat of SAFETY_DATA_STATS) {
      for (const pattern of forbidden) {
        expect(
          pattern.test(stat.label),
          `Stat "${stat.statId}" reads as an operational metric SafePass has not published: ${stat.label}`
        ).toBe(false);
      }
    }
  });
});
