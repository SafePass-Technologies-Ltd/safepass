import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AudienceEntryCards } from './audience-entry-cards';
import { AUDIENCE_LIST } from '@/lib/audience/audience-config';

/**
 * The cards are R-002's in-content mitigation — the branch a visitor takes to
 * their own audience path after scrolling past the sticky header. What matters
 * is that all three paths are present, correctly labelled, and reachable as
 * real links.
 */
describe('AudienceEntryCards', () => {
  it('offers a route for every audience', () => {
    render(<AudienceEntryCards />);

    // Scope each assertion to the card heading rather than a page-wide regex:
    // the card blurbs legitimately share vocabulary across audiences (e.g. the
    // transport card now says "transport business"), which a /Business/i
    // page-wide query treats as a duplicate.
    for (const { label, href } of AUDIENCE_LIST) {
      const heading = screen.getByRole('heading', { name: new RegExp(`^${label}$`, 'i') });
      const link = heading.closest('a');
      expect(link).not.toBeNull();
      expect(link).toHaveAttribute('href', href);
    }
  });

  it('gives each audience its own converting CTA, never a shared generic one', () => {
    // The whole reason the audience split exists: offering Tunde "Get the App"
    // instead of "Request a Demo" is the conversion failure R-001 describes.
    render(<AudienceEntryCards />);

    for (const { ctaLabel } of AUDIENCE_LIST) {
      expect(screen.getByText(ctaLabel)).toBeInTheDocument();
    }
  });

  it('renders exactly three cards as a list', () => {
    render(<AudienceEntryCards />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('is announced as navigation, not decorative content', () => {
    // FEAT-018 acceptance criterion 5. A bare list of links is not a landmark,
    // so a screen-reader user could not jump to the audience choice.
    render(<AudienceEntryCards />);
    expect(screen.getByRole('navigation', { name: /choose your audience/i })).toBeInTheDocument();
  });

  it('describes who each path is for', () => {
    // A card that is just a label is not a branch a visitor can choose between.
    render(<AudienceEntryCards />);
    expect(screen.getByText(/travelling inter-city/i)).toBeInTheDocument();
    expect(screen.getByText(/protect employees travelling for work/i)).toBeInTheDocument();
    expect(screen.getByText(/running a fleet/i)).toBeInTheDocument();
  });
});
