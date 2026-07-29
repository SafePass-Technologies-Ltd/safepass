import Link from 'next/link';
import { Container, Section } from '@/components/ui/container';

export default function NotFound() {
  return (
    <Section>
      <Container className="flex flex-col items-center gap-lg text-center">
        <p className="text-caption uppercase tracking-wide text-text-secondary">404</p>
        <h1 className="text-h1 text-text-primary">Page not found</h1>
        <p className="max-w-prose text-body text-text-secondary">
          That page doesn&apos;t exist, or it may have moved.
        </p>
        <Link href="/" className="text-body text-accent-text underline underline-offset-4">
          Back to homepage
        </Link>
      </Container>
    </Section>
  );
}
