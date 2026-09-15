import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

/**
 * Layout for the Creative-tier pages (screens 1-5).
 *
 * T-037: every page renders the same unified Navbar — the audience-selector
 * variant prop is gone. Audience routing now happens through the three plain
 * nav links, and the CTA stays audience-matched via the audience context
 * (see audience-context.tsx).
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
