import Link from 'next/link';
import { ArrowRight, Building2, Bus, User, type LucideIcon } from 'lucide-react';
import { Container, Section } from '@/components/ui/container';
import { AUDIENCE_LIST, type Audience } from '@/lib/audience/audience-config';
import { cn } from '@/lib/utils';

/**
 * Audience Entry Cards — `screens/01-homepage.md`.
 *
 * Three cards mirroring the header's Audience Selector, "for visitors who
 * scroll past the header". Added during Wave 2 assembly: the screen doc
 * specifies them, but no feature ID in features.md carries them (FEAT-001
 * scopes only the header selector), so no feature slice owned them. Reported as
 * a docs gap rather than silently absorbed into FEAT-001.
 *
 * Worth building rather than deferring: R-002 is "a visitor bounces before
 * finding the CTA meant for them because navigation doesn't surface their
 * audience path fast enough", and its stated mitigation is that the homepage
 * "routes generically, then branches within the first scroll". These cards ARE
 * that branch — without them, a visitor who has scrolled past the sticky header
 * has no in-content route to their own path.
 *
 * A Server Component: the hover/focus lift is pure CSS, so none of this needs
 * client JavaScript, and the three audience routes stay crawlable.
 */

/** One icon per audience. Outlined, matching branding.md §2's icon style. */
const AUDIENCE_ICONS: Record<Audience, LucideIcon> = {
  individual: User,
  business: Building2,
  transport: Bus,
};

/**
 * One line per audience explaining who the path is for.
 *
 * Drawn from user_personas.md's three personas and README.md's audience
 * definitions — deliberately mechanical rather than promotional, per
 * branding.md's tone ("states what the product does mechanically... confident
 * without urgency").
 */
const AUDIENCE_BLURBS: Record<Audience, string> = {
  individual:
    'Travelling inter-city or through a high-risk corridor. Real officers watch your journey and act if something goes wrong.',
  business:
    'Responsible for staff who travel. Monitor journeys, reduce organisational risk, and get reporting your leadership can act on.',
  transport:
    'Running a fleet. Offer monitored trips as a passenger-safety differentiator, with vehicle and driver verification built in.',
};

export function AudienceEntryCards({ className }: { className?: string }) {
  return (
    <Section className={className}>
      <Container className="flex flex-col gap-xl">
        <div className="flex flex-col gap-sm">
          <h2 className="text-h2 text-text-primary">Find your path</h2>
          <p className="text-body-large text-text-secondary">
            SafePass works differently depending on who you are. Pick the one that fits.
          </p>
        </div>

        {/* A real `nav` landmark: FEAT-018's fifth criterion requires these be
            announced as navigation rather than as decorative content, and a
            bare list of links is not a landmark. It also lets a screen-reader
            user jump straight to the audience choice. */}
        <nav aria-label="Choose your audience">
          <ul className="grid gap-md md:grid-cols-3">
            {AUDIENCE_LIST.map(({ audience, label, href, ctaLabel }) => {
              const Icon = AUDIENCE_ICONS[audience];

              return (
                <li key={audience} className="flex">
                  <Link
                    href={href}
                    className={cn(
                      'group flex w-full flex-col gap-md rounded-lg border border-border bg-surface-secondary p-lg',
                      // The restrained, low-overshoot settle the screen doc calls
                      // for on hover/focus lift. Token-driven, never a literal.
                      'transition-[transform,box-shadow,border-color] duration-[var(--duration-fast)] ease-in-out-spring',
                      'hover:-translate-y-1 hover:border-primary hover:shadow-md',
                      // focus-visible lift matches hover: the base theme supplies
                      // the focus ring itself, which must never be removed.
                      'focus-visible:-translate-y-1 focus-visible:border-primary focus-visible:shadow-md'
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      strokeWidth={1.75}
                      className="size-(--size-icon-lg) text-primary"
                    />

                    <div className="flex flex-col gap-sm">
                      <h3 className="text-h3 text-text-primary">{label}</h3>
                      <p className="text-body-small text-text-secondary">
                        {AUDIENCE_BLURBS[audience]}
                      </p>
                    </div>

                    <span className="mt-auto inline-flex items-center gap-xs text-body-small font-semibold text-accent-text">
                      {ctaLabel}
                      <ArrowRight
                        aria-hidden="true"
                        className="size-(--size-icon-sm) transition-transform duration-[var(--duration-instant)] ease-out-smooth group-hover:translate-x-1"
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </Container>
    </Section>
  );
}
