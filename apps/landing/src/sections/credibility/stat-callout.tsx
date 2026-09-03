'use client';

import { useEffect, useRef } from 'react';
import type { SafetyDataStat } from '@safepass/shared';
import { VerificationTierBadge } from '@/components/ui/verification-tier-badge';
import { gsap } from '@/lib/motion/gsap';
import { REVEAL_START, durationSec, gsapEase } from '@/lib/motion/constants';
import { useReducedMotion } from '@/lib/motion/use-reduced-motion';
import { cn } from '@/lib/utils';

/**
 * Sourced stat call-out with a count-up entrance — FEAT-005's third
 * acceptance criterion ("at least one stat call-out uses the count-up
 * animation and monospace `stat` type token on first viewport entry").
 *
 * CRAWLABILITY IS THE CONSTRAINT, not a nice-to-have. The final value, the
 * label, the source, and the as-of date are all rendered server-side and are
 * present in the initial HTML. The animation only *replaces* the already-
 * rendered number with a lower one and counts it back up; with JavaScript
 * disabled, with reduced motion on, or in a crawler, the correct value is what
 * is on screen. Never rewrite this to mount the value on intersection.
 */

/** Splits '₦2,000' into '₦' / 2000 / '' and '5+' into '' / 5 / '+'. */
export function parseStatValue(value: string): {
  prefix: string;
  amount: number | null;
  suffix: string;
  grouped: boolean;
} {
  const match = /^(\D*?)([\d,]+)(.*)$/.exec(value);
  if (!match) return { prefix: '', amount: null, suffix: '', grouped: false };

  const [, prefix, digits, suffix] = match;
  const amount = Number.parseInt(digits.replace(/,/g, ''), 10);

  return {
    prefix,
    amount: Number.isFinite(amount) ? amount : null,
    suffix,
    grouped: digits.includes(','),
  };
}

function formatStatValue(
  amount: number,
  { prefix, suffix, grouped }: { prefix: string; suffix: string; grouped: boolean }
): string {
  const body = grouped ? Math.round(amount).toLocaleString('en-NG') : String(Math.round(amount));
  return `${prefix}${body}${suffix}`;
}

export function StatCallout({
  stat,
  className,
}: {
  stat: SafetyDataStat;
  className?: string;
}) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const element = valueRef.current;
    if (!element || reducedMotion) return;

    const parsed = parseStatValue(stat.value);
    // Non-numeric values (a qualitative stat) simply don't animate — there is
    // nothing to count up to, and faking one would be motion for its own sake.
    if (parsed.amount === null) return;

    const target = parsed.amount;
    const counter = { current: 0 };

    const animation = gsap.fromTo(
      counter,
      { current: 0 },
      {
        current: target,
        duration: durationSec('cinematic'),
        ease: gsapEase('outSmooth'),
        /**
         * WITHOUT THIS, EVERY BELOW-THE-FOLD STAT DISPLAYS ZERO.
         *
         * `fromTo` renders its `from` state immediately on creation by
         * default, even when a ScrollTrigger defers the actual tween. The
         * first `onUpdate` therefore fired at mount and overwrote the
         * server-rendered value with 0 — so a visitor landing on
         * /how-we-verify saw "Cost of a monitored journey: ₦0" until they
         * happened to scroll it into view.
         *
         * That is worse than a cosmetic glitch on this page specifically: it
         * published a false price on the page whose entire purpose is proving
         * SafePass's figures are trustworthy (R-007). Deferring render keeps
         * the true value on screen until the count-up genuinely begins.
         */
        immediateRender: false,
        onUpdate: () => {
          element.textContent = formatStatValue(counter.current, parsed);
        },
        scrollTrigger: {
          trigger: element,
          start: REVEAL_START,
          // First viewport entry only — branding.md rules out re-running stat
          // count-ups "on every scroll pass".
          once: true,
        },
      }
    );

    return () => {
      animation.scrollTrigger?.kill();
      animation.kill();
      // Restore the true value: a torn-down animation must never leave a
      // partial number on screen.
      element.textContent = stat.value;
    };
  }, [reducedMotion, stat.value]);

  return (
    <figure
      className={cn(
        'flex flex-col gap-sm rounded-lg border border-border bg-surface-elevated p-lg',
        className
      )}
      data-stat-id={stat.statId}
    >
      <span
        ref={valueRef}
        className="font-mono text-stat text-accent-text tabular-nums"
        // The value is decorative repetition for a screen reader only if the
        // caption repeats it; it doesn't, so this stays announced.
      >
        {stat.value}
      </span>

      <span className="text-body font-medium text-text-primary">{stat.label}</span>

      {stat.verificationTier ? (
        <VerificationTierBadge tier={stat.verificationTier} className="self-start" />
      ) : null}

      {/* R-007: source and as-of date are rendered, always, next to the figure
          they qualify — not collected in a footnote block a reader can miss.
          "Last reviewed" (client feedback) rather than "As of" reads as an
          actively maintained page, which is the whole point of publishing the
          date at all. */}
      <figcaption className="text-body-small text-text-secondary">
        {stat.source}.{' '}
        <span className="whitespace-nowrap">
          Last reviewed{' '}
          <time dateTime={stat.asOfDate}>
            {new Date(`${stat.asOfDate}T00:00:00Z`).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </time>
        </span>
      </figcaption>
    </figure>
  );
}
