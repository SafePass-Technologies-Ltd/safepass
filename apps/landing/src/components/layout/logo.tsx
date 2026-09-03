import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * SafePass logo lockup — the real brand mark plus the wordmark.
 *
 * branding.md §2 requires the marketing site reuse the product's emblem
 * exactly: "consistency between the marketing site and the product is itself a
 * trust signal." So this renders the supplied artwork rather than an
 * approximation drawn from an icon set.
 *
 * WHY THE MARK IS A ROUNDED TILE RATHER THAN A BARE SHAPE.
 *
 * The supplied PNG has NO transparency — every pixel is opaque, and the
 * night-sky field with its star glow and the red motion swooshes bleeding out
 * past the shield are part of the artwork, not a removable backdrop. Keying the
 * background out would clip the swooshes and leave halos around the shield's
 * emissive edge, which is the logo's signature treatment.
 *
 * Presenting it as a rounded tile is therefore deliberate: it reads as an app
 * icon (which is exactly what it is), and because the artwork's background is
 * near-black navy (`rgb(3,7,18)`) it sits almost invisibly against the `ink`
 * surface in dark mode. In LIGHT mode the tile is visibly dark — acceptable and
 * intentional, but a transparent-background or SVG master would be better and
 * is worth requesting from whoever owns the brand assets.
 */

const SIZES = {
  sm: 28,
  md: 32,
  lg: 40,
} as const;

export function LogoMark({
  size = 'md',
  className,
  priority = false,
}: {
  size?: keyof typeof SIZES;
  className?: string;
  /** Set on the header instance — it is above the fold on every page. */
  priority?: boolean;
}) {
  const px = SIZES[size];

  return (
    <Image
      src="/safepass-logo.png"
      alt=""
      width={px}
      height={px}
      priority={priority}
      /**
       * Decorative here: every call site pairs the mark with the "SafePass"
       * wordmark as real text, so announcing the image too would make a screen
       * reader say the brand name twice. The accessible name comes from the
       * link wrapping the lockup.
       */
      aria-hidden="true"
      className={cn('rounded-md object-contain', className)}
      style={{ width: px, height: px }}
    />
  );
}

/**
 * The full lockup — mark plus wordmark — optionally wrapped in a link home.
 *
 * `href={null}` renders it unlinked, for contexts that are already inside a
 * link or where navigation would be wrong.
 */
export function Logo({
  href = '/',
  size = 'md',
  priority = false,
  tone = 'default',
  className,
}: {
  href?: string | null;
  size?: keyof typeof SIZES;
  priority?: boolean;
  /**
   * `onDark` forces the wordmark white, for use over an always-dark band such
   * as the hero. `text-text-primary` cannot be used there: it is dark slate in
   * light mode, so the wordmark would disappear against the hero.
   */
  tone?: 'default' | 'onDark';
  className?: string;
}) {
  const lockup = (
    <>
      <LogoMark size={size} priority={priority} />
      <span
        className={cn(
          'text-h3 font-bold transition-colors duration-[var(--duration-normal)] ease-out-smooth',
          tone === 'onDark' ? 'text-white' : 'text-text-primary'
        )}
      >
        SafePass
      </span>
    </>
  );

  const classes = cn('flex items-center gap-sm', className);

  if (href === null) {
    return <span className={classes}>{lockup}</span>;
  }

  return (
    <Link href={href} className={classes} aria-label="SafePass home">
      {lockup}
    </Link>
  );
}
