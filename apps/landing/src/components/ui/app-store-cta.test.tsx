import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * FEAT-007 — App Store Download CTA.
 *
 * One test per acceptance criterion, plus the two failure modes that matter in
 * practice: detection returning nothing useful (desktop, crawler, spoofed UA)
 * and the app not being live yet (user_flow.md Flow 1, Alternate Path B).
 */

// `vi.hoisted` runs before module-scope consts are initialised, so the URLs are
// declared inside it and read back out rather than referenced from above.
const mockEnv = vi.hoisted(() => ({
  iosAppUrl: 'https://apps.apple.com/app/safepass',
  androidAppUrl: 'https://play.google.com/store/apps/details?id=com.safepass.app',
  appLive: true,
}));

const IOS_URL = mockEnv.iosAppUrl;
const ANDROID_URL = mockEnv.androidAppUrl;

vi.mock('@/lib/env', () => ({
  get clientEnv() {
    return mockEnv;
  },
}));

const { AppStoreCta } = await import('./app-store-cta');

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const IPADOS_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

function setUserAgent(value: string, maxTouchPoints = 0) {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

function storeLink(store: 'ios' | 'android'): HTMLAnchorElement {
  const link = document.querySelector<HTMLAnchorElement>(`a[data-store="${store}"]`);
  if (!link) throw new Error(`No ${store} store link rendered`);
  return link;
}

beforeEach(() => {
  mockEnv.appLive = true;
  setUserAgent(DESKTOP_UA);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppStoreCta', () => {
  // Criterion 1 — "displays both iOS and Android store badges, or detects
  // device OS and prioritizes the matching badge". Both badges always exist so
  // the links stay crawlable and a mis-detection is never a dead end.
  it('renders both store badges as real anchors', () => {
    render(<AppStoreCta />);

    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(storeLink('ios')).toBeInTheDocument();
    expect(storeLink('android')).toBeInTheDocument();
  });

  // Criterion 2 — each badge navigates to the correct store listing, sourced
  // from env rather than hardcoded.
  it('points each badge at the configured store listing', () => {
    render(<AppStoreCta />);

    expect(storeLink('ios')).toHaveAttribute('href', IOS_URL);
    expect(storeLink('android')).toHaveAttribute('href', ANDROID_URL);
  });

  it('opens store links safely as external navigation', () => {
    render(<AppStoreCta />);

    for (const store of ['ios', 'android'] as const) {
      expect(storeLink(store)).toHaveAttribute('target', '_blank');
      expect(storeLink(store)).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });

  // Criterion 1, detection half.
  it('promotes the iOS badge on an iPhone', () => {
    setUserAgent(IPHONE_UA);
    render(<AppStoreCta />);

    expect(storeLink('ios').className).toContain('order-first');
    expect(storeLink('android').className).not.toContain('order-first');
  });

  it('promotes the Android badge on an Android device', () => {
    setUserAgent(ANDROID_UA);
    render(<AppStoreCta />);

    expect(storeLink('android').className).toContain('order-first');
    expect(storeLink('ios').className).not.toContain('order-first');
  });

  // iPadOS 13+ reports a desktop Safari UA; without the touch-points check
  // every iPad visitor is offered Google Play first.
  it('promotes the iOS badge on iPadOS, which reports a desktop user agent', () => {
    setUserAgent(IPADOS_UA, 5);
    render(<AppStoreCta />);

    expect(storeLink('ios').className).toContain('order-first');
  });

  it('promotes neither badge when the platform cannot be determined', () => {
    setUserAgent(DESKTOP_UA);
    render(<AppStoreCta />);

    expect(storeLink('ios').className).not.toContain('order-first');
    expect(storeLink('android').className).not.toContain('order-first');
    // Both still present and usable — mis-detection must never strand a visitor.
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  // Criterion 4 — 44x44px minimum touch target, met via branding.md's
  // `button-height` (48px) token. Asserting the token, not a pixel literal:
  // jsdom computes no layout, and hardcoding 48 here would duplicate the value
  // the theme owns.
  it('meets the touch target floor via the button-height token', () => {
    render(<AppStoreCta />);

    for (const store of ['ios', 'android'] as const) {
      expect(storeLink(store).className).toContain('h-(--size-button-height)');
    }
  });

  // Criterion 3 — the same component is reused in header, hero, and Individual
  // Traveller Page, so its visual treatment must not vary by caller. `onDark`
  // swaps only the non-promoted variant for hero contrast; the promoted badge
  // stays the primary CTA everywhere.
  it('keeps the promoted badge visually primary on both light and dark surfaces', () => {
    setUserAgent(ANDROID_UA);

    const { unmount } = render(<AppStoreCta />);
    expect(storeLink('android').className).toContain('bg-primary');
    unmount();

    render(<AppStoreCta onDark />);
    expect(storeLink('android').className).toContain('bg-primary');
    expect(storeLink('ios').className).toContain('border-white/40');
  });

  it('renders the optional label when given one', () => {
    render(<AppStoreCta label="Get SafePass on your phone" />);
    expect(screen.getByText('Get SafePass on your phone')).toBeInTheDocument();
  });

  // user_flow.md Flow 1, Alternate Path B: when the app isn't live the CTA is
  // replaced by the waitlist (FEAT-008, Phase 2). Until that exists this must
  // render nothing rather than link to a store listing that doesn't.
  it('renders nothing when the app is not yet live', () => {
    mockEnv.appLive = false;
    const { container } = render(<AppStoreCta />);

    expect(container).toBeEmptyDOMElement();
  });
});
