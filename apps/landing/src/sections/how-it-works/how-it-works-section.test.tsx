import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HowItWorksSection } from './how-it-works-section';
import { HOW_IT_WORKS } from '@/lib/content/how-it-works';

/**
 * FEAT-004 — How It Works Explainer.
 *
 * The acceptance criteria for this feature are mostly about the COPY, so most
 * of these assertions are content assertions. That is not a category error:
 * Flow 1's Alternate Path C says in as many words that a visitor who cannot
 * find a plain mechanical explanation leaves, and that this is "a design
 * failure the ... acceptance criteria are written to prevent". Copy drift here
 * is the failure mode, so copy is what is pinned.
 */

describe('FEAT-004 acceptance criteria', () => {
  it('presents every step with a short plain-language description', () => {
    render(<HowItWorksSection />);

    for (const step of HOW_IT_WORKS.steps) {
      expect(screen.getByRole('heading', { name: step.title })).toBeInTheDocument();
      expect(screen.getByText(step.body)).toBeInTheDocument();
    }
  });

  it('gives each step a line-art icon', () => {
    const { container } = render(<HowItWorksSection />);

    // Lucide renders an <svg>; each is decorative and sits inside an
    // aria-hidden wrapper, so it is queried structurally rather than by role.
    const icons = container.querySelectorAll('li [aria-hidden="true"] svg');
    expect(icons).toHaveLength(HOW_IT_WORKS.steps.length);

    // branding.md Section 7: 2px stroke, consistent with the icon system.
    icons.forEach((icon) => {
      expect(icon.getAttribute('stroke-width')).toBe('2');
    });
  });

  it('explicitly names real human officers, not automated alerts alone', () => {
    render(<HowItWorksSection />);

    // The single differentiator the section exists to establish. If this
    // assertion is ever "fixed" by loosening the regex, the feature has been
    // quietly deleted.
    expect(screen.getByText(/a person, not an automated alert on its own/i)).toBeInTheDocument();
    expect(screen.getByText(HOW_IT_WORKS.footnote)).toBeInTheDocument();
  });

  it('renders the steps as an ordered sequence', () => {
    const { container } = render(<HowItWorksSection />);

    const list = container.querySelector('ol');
    expect(list).not.toBeNull();
    expect(list?.querySelectorAll('li')).toHaveLength(HOW_IT_WORKS.steps.length);
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText(`Step ${HOW_IT_WORKS.steps.length}`)).toBeInTheDocument();
  });

  it('covers the five mechanics FEAT-004 enumerates', () => {
    render(<HowItWorksSection />);

    // The mechanic is the same even where the client changed the wording:
    // register → activate monitoring (fund) → live human monitoring →
    // confirm arrival → rapid emergency response.
    expect(screen.getByText(/register your journey/i)).toBeInTheDocument();
    expect(screen.getByText(/activate monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/live human monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/confirm checkpoints and arrival/i)).toBeInTheDocument();
    expect(screen.getByText(/rapid emergency response/i)).toBeInTheDocument();
  });

  it('is anchorable from the hero', () => {
    const { container } = render(<HowItWorksSection />);

    // Flow 1 step 3 — the hero's scroll cue links to this id.
    expect(container.querySelector('#how-it-works')).not.toBeNull();
  });

  it('Loaded (static) — content ships with the page, not with the reveal', () => {
    const { container } = render(<HowItWorksSection />);

    // user_flow.md lists this section's only state as "Loaded (static — no
    // loading/error states, content ships with the page)". `Reveal` animates
    // opacity on already-rendered children; it must never gate mounting.
    expect(container.innerHTML).toContain(HOW_IT_WORKS.steps[0].body);
  });
});

describe('scannability (FEAT-004: under 30 seconds on mobile)', () => {
  it('keeps every step to a short block rather than a paragraph', () => {
    for (const step of HOW_IT_WORKS.steps) {
      // ~200 characters is roughly two spoken sentences — the practical ceiling
      // for a card that has to be skimmed, not read.
      expect(step.body.length).toBeLessThanOrEqual(200);
      expect(step.title.length).toBeLessThanOrEqual(48);
    }
  });

  it('states only the two documented pricing figures and no other numbers', () => {
    // The ₦2,000 wallet minimum and ₦2,000 per-journey fee are documented in
    // user_flow.md. Any other figure appearing here would be an invented claim.
    const prose = HOW_IT_WORKS.steps.map((step) => `${step.title} ${step.body}`).join(' ');
    // Anchored on a digit: `[\d,]+` alone also matches ordinary prose commas.
    const figures = prose.match(/\d[\d,]*/g) ?? [];

    expect(figures.every((figure) => figure === '2,000')).toBe(true);
  });
});
