import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { Container } from '@/components/ui/container';

/**
 * Standard Static Page Layout — screens.md, used by Privacy, Terms, and About.
 *
 * Deliberately NOT Creative-tier: screens.md states plainly that "a legal
 * disclosure page has no experience worth applying motion to". These pages get
 * the same unified Navbar every other page carries (T-037) and a single ~800px
 * prose column, and no scroll-driven motion at all.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main id="main">
        <Container width="prose">{children}</Container>
      </main>
      <Footer />
    </>
  );
}
