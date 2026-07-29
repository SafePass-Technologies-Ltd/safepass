import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

/**
 * Layout for the Creative-tier pages (screens 1-5).
 *
 * These pages carry the audience-selecting Navbar variant, since routing each
 * visitor to their own path is the whole information-architecture strategy
 * (FEAT-001, mitigating R-001/R-002).
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar showAudienceSelector />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
