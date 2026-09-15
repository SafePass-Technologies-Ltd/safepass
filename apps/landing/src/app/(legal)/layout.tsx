import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

/**
 * Standard Static Page Layout — screens.md. Privacy, Terms, and About.
 *
 * Deliberately NOT Creative-tier: screens.md states plainly that "a legal
 * disclosure page has no experience worth applying motion to". These pages get
 * the same unified Navbar every other page carries (T-037) and no scroll-driven
 * motion at all.
 *
 * The reading WIDTH is chosen per page, not here: the two legal documents keep
 * the narrow ~800px prose column (long clauses read badly at full width), while
 * About — a company/credibility page, not a disclosure — uses the standard
 * site width so it matches every other page. A shared container here forced all
 * three into the legal column and left About visibly narrower than the rest of
 * the site.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
