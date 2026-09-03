import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { ButtonLink } from '@/components/ui/button';
import { Logo } from '@/components/layout/logo';
import {
  AUDIENCE_NAV,
  BRAND_TAGLINE,
  CONTACT_EMAIL,
  FOOTER_EXPLORE,
  FOOTER_LEGAL,
  SOCIAL_LINKS,
} from '@/lib/content/navigation';

/**
 * Shared footer — FEAT-002.
 *
 * Its job is legitimacy, not navigation: Tunde's user story is explicitly about
 * confirming SafePass "is a credible, operational vendor before submitting a
 * lead form", so the contact address and legal links are the load-bearing
 * content here and the repeated CTAs are secondary.
 *
 * Deliberately a Server Component with no motion. It sits below every page's
 * last reveal, and its whole value is being present and crawlable in the
 * server-rendered HTML — risk_log.md R-011 requires a live, reachable Privacy
 * Policy before any lead-capture form ships, and FEAT-015 requires all three
 * legal pages be reachable within two clicks of the homepage. Neither survives
 * being gated behind a scroll trigger.
 *
 * The secondary CTAs point at each audience's own page rather than straight at
 * the app stores or a form: the store links (FEAT-007) and the lead forms
 * (FEAT-010/FEAT-012) live on those pages with the context that makes them
 * convert, and duplicating them here would fork that logic in two places.
 */
export function Footer() {
  return (
    <footer className="mt-3xl border-t border-border bg-surface-secondary">
      <Container className="flex flex-col gap-2xl py-2xl">
        {/* Identity spans wider than the nav columns; the navs (Explore, Legal,
            and Social when populated) sit to the right. Flex rather than a fixed
            grid so the Social column can appear without redefining the layout. */}
        <div className="flex flex-col gap-xl md:flex-row md:gap-lg">
          {/* Identity + contact method (FEAT-002 acceptance criterion 3). */}
          <div className="flex flex-col gap-sm md:mr-xl md:w-[40%] md:shrink-0">
            {/* Unlinked: the footer's Explore column already carries a Home
                link, so a second one on the wordmark is redundant. */}
            <Logo href={null} size="lg" />
            <p className="text-body-small text-text-secondary">{BRAND_TAGLINE}</p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-sm text-body-small text-text-secondary transition-colors duration-[var(--duration-instant)] ease-out-smooth hover:text-text-primary"
            >
              <Mail aria-hidden="true" className="size-(--size-icon-sm)" />
              {CONTACT_EMAIL}
            </a>
          </div>

          <nav aria-label="Explore" className="flex flex-col gap-sm">
            <h2 className="text-caption uppercase text-text-secondary">Explore</h2>
            {FOOTER_EXPLORE.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-body-small text-text-secondary transition-colors duration-[var(--duration-instant)] ease-out-smooth hover:text-text-primary"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <nav aria-label="Legal" className="flex flex-col gap-sm">
            <h2 className="text-caption uppercase text-text-secondary">Legal</h2>
            {FOOTER_LEGAL.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-body-small text-text-secondary transition-colors duration-[var(--duration-instant)] ease-out-smooth hover:text-text-primary"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Social/press links (FEAT-002's description mentions them), in their
            own row so they never crowd the nav columns or need a grid change.
            Hidden entirely until `SOCIAL_LINKS` is non-empty — it is
            deliberately empty until the client supplies real URLs (never a
            fabricated handle). Each is an external anchor whose label is the
            accessible name, so the platform is announced by screen readers and
            `rel` guards window.opener. */}
        {SOCIAL_LINKS.length > 0 && (
          <nav aria-label="Social" className="flex flex-col gap-sm">
            <h2 className="text-caption uppercase text-text-secondary">Follow us</h2>
            <div className="flex flex-wrap gap-lg">
              {SOCIAL_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-body-small text-text-secondary transition-colors duration-[var(--duration-instant)] ease-out-smooth hover:text-text-primary"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </nav>
        )}

        {/* Repeated secondary CTAs, one per audience. `secondary` rather than
            `primary` variant: branding.md reserves shadow-glow-primary for the
            page's single primary CTA, and a footer full of glowing buttons
            would compete with it. */}
        <div className="flex flex-col gap-sm border-t border-border pt-xl sm:flex-row sm:flex-wrap">
          {AUDIENCE_NAV.map(({ audience, href, ctaLabel }) => (
            <ButtonLink key={audience} href={href} variant="secondary">
              {ctaLabel}
            </ButtonLink>
          ))}
        </div>

        <p className="text-body-small text-text-secondary">
          &copy; {new Date().getFullYear()} SafePass. {BRAND_TAGLINE}
        </p>
      </Container>
    </footer>
  );
}
