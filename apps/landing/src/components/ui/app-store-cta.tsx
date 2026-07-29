'use client';

import { useSyncExternalStore } from 'react';
import { Apple, Play } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { clientEnv } from '@/lib/env';
import { cn } from '@/lib/utils';

/**
 * App Store Download CTA — FEAT-007.
 *
 * Used in the header, the hero, and the Individual Traveller Page
 * (`screens/02-individual-traveller-page.md`), always with the same visual
 * treatment — that sameness is acceptance criterion 3, so this component is the
 * only place store links are rendered.
 *
 * BOTH badges always render as real, crawlable anchors, and the badge matching
 * the visitor's device is *promoted* to first position and the primary variant.
 * FEAT-007's first criterion allows either "show both" or "detect and
 * prioritise"; doing both satisfies either reading and, more importantly,
 * degrades safely — when user-agent detection is wrong or unavailable (SSR,
 * crawler, desktop, spoofed UA) the visitor still has a working link to the
 * store they actually need, instead of the wrong one.
 *
 * Promotion is done with CSS `order` rather than by reordering the DOM, so the
 * server-rendered markup and the hydrated markup are identical and there is no
 * hydration mismatch or content shift.
 */

type DevicePlatform = 'ios' | 'android' | 'unknown';

/**
 * Reads the platform from the user agent.
 *
 * The `Macintosh` + touch-points branch catches iPadOS 13+, which reports a
 * desktop Safari UA — without it every iPad visitor is offered Google Play
 * first.
 */
function detectPlatform(): DevicePlatform {
  if (typeof navigator === 'undefined') return 'unknown';

  const ua = navigator.userAgent;

  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios';

  return 'unknown';
}

/**
 * The user agent never changes for the life of the document, so there is
 * nothing to subscribe to — this is a no-op unsubscribe.
 */
const noopSubscribe = () => () => {};

/** Server and first-paint snapshot: neither badge promoted, both usable. */
const serverSnapshot = (): DevicePlatform => 'unknown';

export interface AppStoreCtaProps {
  className?: string;
  /**
   * Rendered above the badges. Omit where the surrounding section already
   * carries the heading (e.g. the hero) to avoid a duplicated call to action.
   */
  label?: string;
  /** Use on the dark hero band, where the light `secondary` fill has no contrast. */
  onDark?: boolean;
}

export function AppStoreCta({ className, label, onDark = false }: AppStoreCtaProps) {
  /**
   * `useSyncExternalStore` rather than state-in-an-effect: the user agent is
   * external, read-only, browser-only data, and this is the API that reads it
   * with an explicit server snapshot instead of a cascading re-render.
   */
  const platform = useSyncExternalStore(noopSubscribe, detectPlatform, serverSnapshot);

  /**
   * When the app is not yet downloadable the CTA is replaced by the waitlist
   * prompt (user_flow.md Flow 1, Alternate Path B). The waitlist itself is
   * FEAT-008 and ships in Phase 2; until then this renders nothing rather than
   * linking a visitor to a store listing that does not exist.
   */
  if (!clientEnv.appLive) return null;

  const secondaryVariant = onDark ? 'outline' : 'secondary';

  return (
    <div className={cn('flex flex-col gap-sm', className)}>
      {label ? <p className="text-body-small text-text-secondary">{label}</p> : null}

      <div className="flex flex-col gap-md sm:flex-row sm:items-center">
        <ButtonLink
          external
          href={clientEnv.iosAppUrl}
          variant={platform === 'ios' ? 'primary' : secondaryVariant}
          className={platform === 'ios' ? 'order-first' : undefined}
          data-store="ios"
          aria-label="Download SafePass on the App Store"
        >
          <Apple aria-hidden="true" className="size-(--size-icon-md)" strokeWidth={1.75} />
          Download on the App Store
        </ButtonLink>

        <ButtonLink
          external
          href={clientEnv.androidAppUrl}
          variant={platform === 'android' ? 'primary' : secondaryVariant}
          className={platform === 'android' ? 'order-first' : undefined}
          data-store="android"
          aria-label="Get SafePass on Google Play"
        >
          <Play aria-hidden="true" className="size-(--size-icon-md)" strokeWidth={1.75} />
          Get it on Google Play
        </ButtonLink>
      </div>
    </div>
  );
}
