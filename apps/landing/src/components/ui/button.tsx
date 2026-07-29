import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Button — implements branding.md Section 3.5's Buttons table.
 *
 * Five variants, exactly as specified. Note `destructive` is deliberately
 * scarce: branding.md reserves the `error` token for "form validation errors
 * only — never used decoratively; reserved so it retains its emergency
 * association from the core product". Reaching for it as a generic "danger"
 * colour would erode a signal the actual safety product depends on.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  /**
   * `text-ink`, NOT the `#FFFFFF` branding.md §3.5 specifies.
   *
   * White on `primary` fails WCAG AA in BOTH modes — 2.77:1 on the light
   * `#0EA5E9` and 2.14:1 on the dark `#38BDF8`, against the 4.5:1 that §4
   * commits to for normal text ("verified independently per mode, not assumed
   * from the light-mode pass"). §3.5 and §4 cannot both be satisfied, and these
   * are the site's conversion buttons — the single most important text on the
   * page to be able to read.
   *
   * `ink` is an existing token and passes in both modes: 5.28:1 light,
   * 8.74:1 dark. No new colour is invented here.
   *
   * KNOWN GAP: the hover state (`primary-hover`) reaches only 3.63:1 in light
   * mode, and cannot pass with white (4.03:1) either — that mid-tone blue is
   * unusable at AA with any current text token. Reported for product-shaper.
   */
  primary: 'bg-primary text-ink hover:bg-primary-hover shadow-glow-primary',
  /**
   * `text-text-primary` rather than `text-primary`: blue-on-`primary-light` is
   * 2.45:1 in light mode. This pairing passes both (12.91:1 / 11.53:1).
   */
  secondary: 'bg-primary-light text-text-primary hover:bg-primary-light/80',
  // For use on the dark hero band only.
  outline: 'bg-transparent text-white border-[1.5px] border-white/40 hover:border-white/70',
  ghost: 'bg-transparent text-text-secondary hover:text-text-primary',
  destructive: 'bg-error text-white hover:bg-error/90',
};

const BASE_CLASSES = cn(
  'inline-flex items-center justify-center gap-sm',
  // button-height (48px) exceeds the 44px a11y floor deliberately — these CTAs
  // are the site's entire purpose (branding.md 3.3).
  'h-(--size-button-height) px-[28px] py-md',
  'rounded-md text-body font-semibold',
  'transition-colors duration-[--duration-instant] ease-out-smooth',
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
  'whitespace-nowrap'
);

interface BaseProps {
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}

type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant = 'primary', className, children, ...props }: ButtonProps) {
  return (
    <button className={cn(BASE_CLASSES, VARIANT_CLASSES[variant], className)} {...props}>
      {children}
    </button>
  );
}

type ButtonLinkProps = BaseProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    /** Set for outbound links (app stores, external partners). */
    external?: boolean;
  };

/**
 * Anchor styled as a button. Used wherever the action is navigation rather
 * than a state change — notably the app store CTAs (FEAT-007), which must be
 * real links so they're crawlable and long-pressable on mobile.
 */
export function ButtonLink({
  variant = 'primary',
  className,
  children,
  href,
  external = false,
  ...props
}: ButtonLinkProps) {
  const classes = cn(BASE_CLASSES, VARIANT_CLASSES[variant], className);

  if (external) {
    return (
      <a href={href} className={classes} rel="noopener noreferrer" target="_blank" {...props}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...props}>
      {children}
    </Link>
  );
}
