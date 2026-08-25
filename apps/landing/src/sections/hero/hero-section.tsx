import { ArrowDown } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { ButtonLink } from '@/components/ui/button';
import { AppStoreCta } from '@/components/ui/app-store-cta';
import { HERO } from '@/lib/content/hero';
import { clientEnv } from '@/lib/env';
import { HeroStage } from './hero-stage';

/**
 * Homepage hero — FEAT-003, `screens/01-homepage.md` (Hero Section).
 *
 * A SERVER Component. Every word below is in the initial HTML, which is what
 * satisfies the screen's Loading state ("server-rendered content is immediately
 * visible — no blank screen; the motion layer hydrates in afterward") and the
 * slow-network edge case ("text content must be visible and legible before any
 * motion-layer JavaScript loads"). `HeroStage` is the only client boundary and
 * receives this markup as children — it decorates the content, it never
 * produces it.
 *
 * The `data-hero-line` / `data-hero-supporting` attributes are the animation's
 * only contract with the copy. That indirection is deliberate (risk_log.md
 * R-005): a copy change here must never require editing animation code.
 *
 * ASSET NOTE: the Asset Plan calls for a 3D navy shield and an AI-generated
 * environmental photograph as the mobile static fallback. Neither exists in the
 * repo, and the 3D pipeline is deferred by the scope decision recorded in
 * IMPLEMENTATION.md. The hero is therefore composed from the `gradient-hero`
 * field, the route-line, and the radar sweep — a complete composition in its
 * own right rather than a layout with a hole where an image should be. Both
 * assets are reported as outstanding.
 */
export function HeroSection() {
  return (
    <HeroStage>
      <Container className="py-3xl">
        <div className="max-w-(--container-prose)">
          <p
            data-hero-supporting
            className="text-caption font-medium tracking-widest text-primary uppercase"
          >
            {HERO.eyebrow}
          </p>

          {/*
            One H1 per page (FEAT-013's semantic-hierarchy criterion). The
            visible text is split into animatable line spans, so the accessible
            name is supplied separately to guarantee screen readers announce a
            single clean sentence regardless of how the lines are split.
          */}
          <h1 className="mt-md text-h1 text-white md:text-display">
            <span className="sr-only">{HERO.headline}</span>
            <span aria-hidden="true">
              {HERO.headlineLines.map((line) => (
                <span key={line} data-hero-line className="block">
                  {line}
                </span>
              ))}
            </span>
          </h1>

          <p data-hero-supporting className="mt-lg text-body-large text-white/80">
            {HERO.subheadline}
          </p>

          <div data-hero-supporting className="mt-xl flex flex-col gap-lg">
            {/*
              FEAT-003: "Primary CTA is visible in the hero and links to the app
              download section (default/individual audience state)."
              `AppStoreCta` renders nothing when the app is not yet live
              (user_flow.md Flow 1, Alternate Path B), so the secondary link is
              promoted to primary in that case — the hero is never left without
              a converting action. The waitlist prompt that Alt-B ultimately
              calls for is FEAT-008, which ships in Phase 2.
            */}
            <AppStoreCta onDark label={HERO.ctaLabel} />

            <ButtonLink
              href={HERO.secondaryCta.href}
              variant={clientEnv.appLive ? 'outline' : 'primary'}
              className="self-start"
            >
              {HERO.secondaryCta.label}
            </ButtonLink>
          </div>

          {/*
            Flow 1 step 3 depends on the visitor scrolling into How It Works;
            Alternate Path C is the visitor who skims and bounces. A plain
            anchor is the cheapest insurance — it is also a real link, so it
            works with keyboard, with JavaScript off, and for a crawler.
          */}
          <a
            data-hero-supporting
            href="#how-it-works"
            className="mt-2xl inline-flex items-center gap-sm text-body-small text-white/70 transition-colors duration-[var(--duration-instant)] ease-out-smooth hover:text-white"
          >
            <ArrowDown aria-hidden="true" className="size-(--size-icon-sm)" strokeWidth={2} />
            {HERO.scrollCue}
          </a>
        </div>
      </Container>
    </HeroStage>
  );
}
