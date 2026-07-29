'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Container, Section } from '@/components/ui/container';

/**
 * Shared Error State — screens.md, "Used on: all screens, for page-level
 * render failures".
 *
 * Deliberately plain: screens.md specifies a centred message with a "Try
 * Again" link and a link home, and explicitly notes "no illustration required
 * (this site's error states are rare, static-content-first pages)". A
 * dressed-up error page would also cut against the Calm, Authoritative
 * personality at the exact moment the site has already let the visitor down.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[page-error]', error.digest ?? error.message);
  }, [error]);

  return (
    <Section>
      <Container className="flex flex-col items-center gap-lg text-center">
        <h1 className="text-h1 text-text-primary">Something went wrong</h1>
        <p className="max-w-prose text-body text-text-secondary">
          We couldn&apos;t load this page. Your details are safe — nothing was submitted.
        </p>
        <div className="flex flex-wrap justify-center gap-md">
          <Button onClick={reset}>Try again</Button>
          <Link href="/" className="text-body text-accent-text underline underline-offset-4">
            Back to homepage
          </Link>
        </div>
      </Container>
    </Section>
  );
}
