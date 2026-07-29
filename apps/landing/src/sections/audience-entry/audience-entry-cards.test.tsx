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

    for (const { label, href } of AUDIENCE_LIST) {
      const link = screen.getByRole('link', { name: new RegExp(label, 'i') });
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
    expect(screen.getByText(/responsible for staff who travel/i)).toBeInTheDocument();
    expect(screen.getByText(/running a fleet/i)).toBeInTheDocument();
  });
});
