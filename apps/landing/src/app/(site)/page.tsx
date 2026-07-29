import { HeroSection } from '@/sections/hero/hero-section';
import { HowItWorksSection } from '@/sections/how-it-works/how-it-works-section';
import { CredibilityPreview } from '@/sections/credibility';
import { AudienceEntryCards } from '@/sections/audience-entry/audience-entry-cards';

/**
 * Homepage — `screens/01-homepage.md`.
 *
 * Composed of Server Components end to end, so the full page text is in the
 * initial HTML. The motion layer hydrates on top of it (the screen's Loading
 * state), and if it never hydrates at all the page still reads correctly.
 *
 * Section order follows the screen doc: Hero → How It Works → Credibility
 * Preview → Audience Entry Cards → Footer (supplied by `(site)/layout.tsx`).
 */
export default function HomePage() {
  return (
    <>
      {/* FEAT-003 */}
      <HeroSection />

      {/* FEAT-004 */}
      <HowItWorksSection />

      {/* FEAT-005 — the same module rendered standalone at /how-we-verify,
          per screens.md's Cross-Screen Notes ("a single shared module, not
          duplicated content"). */}
      <CredibilityPreview />

      {/* Specified by screens/01-homepage.md but carried by no feature ID —
          added during Wave 2 assembly. See the component's own doc for why it
          was built rather than deferred (R-002). */}
      <AudienceEntryCards />
    </>
  );
}
