/**
 * "How It Works" explainer copy — FEAT-004, `screens/01-homepage.md`.
 *
 * FEAT-004's acceptance criteria are unusually prescriptive about the COPY
 * rather than the markup, so the copy is the part held still here:
 *
 * - "short plain-language description (no jargon, no unexplained claims)" —
 *   every `body` below is one or two sentences and names a concrete mechanic.
 * - "explicitly names that monitoring is done by real human officers, not
 *   automated alerts only" — step 3, in those words. Do not soften it to
 *   "monitoring" during a copy pass; it is the single differentiator the whole
 *   section exists to establish, per `docs/SafePass/README.md`.
 * - "scannable in under 30 seconds on mobile" — hence the hard length
 *   discipline. `title` is a phrase, `body` is not a paragraph.
 *
 * The pricing figures are the only numbers on this page, and both are
 * documented (`user_flow.md` Flow 1 step 5: "₦2,000 wallet minimum, ₦2,000
 * per-journey fee"). No statistic, coverage figure, or response time appears
 * here, because no document supplies one to cite.
 *
 * NOTE — step count: `features.md` FEAT-004 enumerates five mechanics
 * (register, fund, monitor, confirm arrival, escalate) while
 * `screens/01-homepage.md` describes the section as a "four-step explainer".
 * The five named in FEAT-004 are implemented, since those are the testable
 * acceptance criteria. Reported as a docs contradiction.
 */

/**
 * Icon keys rather than imported Lucide components.
 *
 * Keeps this module free of any React/JSX dependency so it stays trivially
 * server-importable and testable, and confines icon choice to the component
 * that actually renders one.
 */
export type HowItWorksIcon = 'route' | 'wallet' | 'eye' | 'check' | 'alert';

export interface HowItWorksStep {
  /** Stable key for React lists and tests — never the array index. */
  id: string;
  title: string;
  body: string;
  icon: HowItWorksIcon;
}

export interface HowItWorksContent {
  eyebrow: string;
  heading: string;
  intro: string;
  steps: readonly HowItWorksStep[];
  /** Closing line reinforcing FEAT-004's "real human officers" criterion. */
  footnote: string;
}

export const HOW_IT_WORKS: HowItWorksContent = {
  eyebrow: 'How it works',
  heading: 'What actually happens when you travel',
  intro: 'Five steps. No jargon, and nothing hidden behind a signup.',
  steps: [
    {
      id: 'register',
      title: 'Register your journey',
      body: 'Set your route and departure time in the SafePass app before you leave, so there is a record of where you are going and when you should arrive.',
      icon: 'route',
    },
    {
      id: 'fund',
      title: 'Activate monitoring',
      body: 'Monitoring is paid from your in-app wallet: a ₦2,000 minimum balance, and ₦2,000 for each monitored journey.',
      icon: 'wallet',
    },
    {
      id: 'monitor',
      title: 'Live human monitoring',
      body: 'A SafePass monitoring officer (a person, not an automated alert on its own) follows your live location for the whole journey and can message you through the app.',
      icon: 'eye',
    },
    {
      id: 'arrive',
      title: 'Confirm checkpoints and arrival',
      body: 'You confirm checkpoints along the route and your safe arrival at the end, so the officer always knows the journey is going as planned.',
      icon: 'check',
    },
    {
      id: 'escalate',
      title: 'Rapid emergency response',
      body: 'If you trigger the panic alert, the officer escalates straight away, and (where permitted by law) the app can securely preserve background audio as evidence.',
      icon: 'alert',
    },
  ],
  footnote:
    'The monitoring is done by SafePass officers on shift. Automated alerts support them; they do not replace them.',
};
