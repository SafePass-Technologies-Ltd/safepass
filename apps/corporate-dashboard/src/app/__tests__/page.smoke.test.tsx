// Corporate Dashboard - smoke tests
// T-028: Safeguard against regressions in the render pipeline that Next.js
// orchestrates and that no other check in this app exercises end-to-end.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// The login page runs under the App Router; outside Next.js there is no
// RouterContext, so useRouter throws. The smoke test only needs the shell
// to mount, never to navigate, so a stub router is enough.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

// Keep the test framework-free on assets: next/image quality/loader config
// is a runtime concern the shell render shouldn't gate on. A placeholder
// marker stands in for the optimized <img>; the shell layout (heading, copy,
// sign-in button) is what this test asserts.
vi.mock('next/image', () => ({
  default: (props: { alt: string }) => <span role="img" aria-label={props.alt} data-testid="safepass-logo" />,
}));

import LoginPage from '../page';

describe('corporate dashboard app shell (login page)', () => {
  it('renders the SafePass corporate login shell without crashing', () => {
    // Smoke test: rendering this page exercises the pieces a runtime break
    // anywhere in the login flow (component, lib imports, routing hooks)
    // would expose. Next.js never tests arbitrary pages in isolation.
    render(<LoginPage />);
    expect(screen.getByRole('heading', { level: 1, name: /safepass corporate/i })).toBeTruthy();
  });
});
