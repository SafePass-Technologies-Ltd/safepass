/**
 * Copy for the three audience pages — FEAT-006, FEAT-009, FEAT-011.
 *
 * A plain module (no `'use client'`) so the pages can stay Server Components.
 *
 * SOURCING RULE, and it is the important thing about this file: every factual
 * claim below traces to `docs/SafePassLanding/README.md`, `docs/SafePass/README.md`,
 * or `docs/SafePassLanding/monetization.md`. Capability lists describe what the
 * MVP dashboards actually ship (README "MVP Features (v1.0)"), and the pricing
 * figures are the documented ₦2,000 wallet minimum and ₦2,000 per-journey fee.
 *
 * There are NO operational statistics here — no fleet counts, corridor
 * coverage, response times, or customer names. SafePass has published none, and
 * risk_log.md R-007 makes an unverifiable claim an active liability on a site
 * whose entire pitch is verified information. If you are adding a number here,
 * it needs a source in the docs first.
 */

export interface ContentCard {
  title: string;
  body: string;
}

// -----------------------------------------------------------------------------
// Individual traveller (FEAT-006) — screens/02
// -----------------------------------------------------------------------------

export const INDIVIDUAL_CONTENT = {
  eyebrow: 'For travellers',
  heading: 'Someone is watching your journey. An actual person.',
  lead: 'Register a journey before you set off and a SafePass officer follows it live from departure to arrival — not an app that notices something went wrong afterwards.',

  /**
   * Two use cases, both named in `docs/SafePass/README.md` and required by
   * FEAT-006's second acceptance criterion.
   */
  useCases: [
    {
      title: 'Inter-city travel',
      body: 'Lagos to Abuja, Port Harcourt to Enugu, or any long road journey between cities. Your route is monitored the whole way, and the people who need to know you arrived are told when you do.',
    },
    {
      title: 'High-risk corridor travel',
      body: 'Roads with a known history of incidents. SafePass maps verified reports along your route, and an officer is already watching if something changes while you are on it.',
    },
  ] satisfies ContentCard[],

  /** Pricing is stated openly — FEAT-006 AC1 forbids hiding it behind signup. */
  pricing: {
    heading: 'What it costs',
    lead: 'No subscription, and nothing hidden behind a signup. You fund a wallet and pay per monitored journey.',
    items: [
      {
        value: '₦2,000',
        label: 'Per monitored journey',
        // monetization.md is precise about WHEN: deducted when monitoring
        // begins, not when the traveller taps "Start Journey". Stating it
        // loosely would misdescribe a real charge.
        detail:
          'Deducted from your wallet when monitoring actually begins — not when you tap start. You only pay for journeys you register.',
      },
      {
        value: '₦2,000',
        label: 'Minimum wallet funding',
        detail: 'The smallest top-up. Fund your wallet in the app through Paystack or Flutterwave.',
      },
    ],
    footnote:
      'This is SafePass’s real published pricing, shown in full before you download. There is no subscription, no trial offer, and no promotional rate — payment happens in the app, never on this site.',
  },

  credibilityLink: {
    label: 'See how we verify safety data',
    href: '/how-we-verify',
  },
} as const;

// -----------------------------------------------------------------------------
// Corporate (FEAT-009) — screens/03
// -----------------------------------------------------------------------------

export const CORPORATE_CONTENT = {
  eyebrow: 'For business',
  heading: 'Know your people got there.',
  lead: 'SafePass monitors staff road travel with real officers watching live, and gives your security and operations teams a record of every journey rather than a phone call after the fact.',

  /** Both use cases are named in `docs/SafePass/README.md`. */
  useCases: [
    {
      title: 'Staff travel between branches',
      body: 'Employees moving between offices or sites on inter-city roads. Register the journey, and the trip is monitored end to end with arrival confirmed rather than assumed.',
    },
    {
      title: 'Field operations',
      body: 'Teams working away from a fixed site — field engineers, assessors, NGO staff in remote areas. Each journey is watched live, with escalation if contact is lost.',
    },
  ] satisfies ContentCard[],

  /**
   * Marketing-level description of the Corporate Dashboard's MVP capability
   * set, per FEAT-009 AC2 ("without exposing internal implementation"). Each
   * item corresponds to a shipped v1.0 dashboard feature in
   * `docs/SafePass/README.md`.
   */
  dashboard: {
    heading: 'What your team gets',
    lead: 'A dashboard for whoever owns staff safety — not another inbox to watch.',
    capabilities: [
      { title: 'Staff management', body: 'Add the people who travel and manage who belongs to your organisation.' },
      { title: 'Trip registration for staff', body: 'Register journeys on behalf of employees, so monitoring does not depend on someone remembering to do it themselves.' },
      { title: 'Live trip monitoring', body: 'See journeys in progress and their current status as officers track them.' },
      { title: 'Alert reception', body: 'Receive alerts when a monitored journey escalates, routed to the people responsible for responding.' },
      { title: 'Trip history and reports', body: 'A record of completed journeys for internal reporting and review.' },
    ] satisfies ContentCard[],
  },

  /**
   * Data-handling posture, at the "high level" FEAT-009's description asks for.
   *
   * Deliberately describes only what is architecturally true and documented,
   * and makes no compliance certification claim (no "ISO 27001", no "NDPR
   * compliant") — those are assertions only the business and counsel can make.
   */
  dataPosture: {
    heading: 'How we handle your data',
    lead: 'Questions your security review will ask, answered plainly.',
    points: [
      { title: 'Journey data belongs to your organisation', body: 'Trip records for staff you register are visible to your organisation’s dashboard users, not published or shared with other customers.' },
      { title: 'Emergency evidence is retained deliberately', body: 'Where an emergency is triggered, SafePass captures evidence so there is a record afterwards. Retention and access are covered in our Privacy Policy.' },
      { title: 'Monitoring is staffed, and staff are accountable', body: 'Journeys are watched by SafePass officers operating under internal access controls, rather than being visible to anyone with an account.' },
    ] satisfies ContentCard[],
    /** Points at the real policy rather than restating it — that page is authoritative. */
    policyNote: 'Full detail, including retention periods and data-subject rights, is in our Privacy Policy.',
  },

  overview: {
    heading: 'Take this to your team',
    body: 'A one-page summary of what SafePass does, how monitoring works, and what it costs — formatted to print or save as a PDF and forward internally.',
    ctaLabel: 'Open the one-page overview',
  },

  demo: {
    heading: 'Request a demo',
    lead: 'Tell us how your people travel and we will walk you through what monitoring would look like for your organisation.',
  },
} as const;

// -----------------------------------------------------------------------------
// Transport partner (FEAT-011) — screens/04
// -----------------------------------------------------------------------------

export const TRANSPORT_CONTENT = {
  eyebrow: 'For transport partners',
  heading: 'Make “monitored” something you can advertise.',
  lead: 'SafePass gives fleet operators verified vehicles, verified drivers, and journeys watched live by real officers — and gives your passengers a reason to choose you.',

  /**
   * Capability list from the Transport Partner Dashboard's v1.0 scope in
   * `docs/SafePass/README.md`. FEAT-011 AC1 requires vehicle/driver management
   * and QR verification specifically.
   */
  fleet: {
    heading: 'Vehicles and drivers',
    lead: 'Your fleet, registered and verifiable.',
    capabilities: [
      { title: 'Vehicle management', body: 'Register each vehicle in your fleet and keep its details current in one place.' },
      { title: 'SafePass QR per vehicle', body: 'Every registered vehicle gets its own SafePass QR code, so a passenger can check they are in the vehicle they were told they would be in.' },
      { title: 'Driver management', body: 'Register drivers and keep their records attached to the vehicles they operate.' },
      { title: 'Document verification', body: 'Upload compliance documents — registration, insurance, roadworthiness, licences — for verification.' },
      { title: 'Linked trip monitoring', body: 'See journeys linked to your vehicles as they are monitored.' },
      { title: 'Safety alerts', body: 'Receive alerts when a journey involving one of your vehicles escalates.' },
    ] satisfies ContentCard[],
  },

  /** FEAT-011 AC3 — the passenger-facing differentiator as a marketable claim. */
  differentiator: {
    heading: 'A safety claim you can actually back',
    lead: 'Passengers choosing between operators have very little to go on. Monitored journeys give them something concrete.',
    points: [
      { title: 'Passengers can verify the vehicle', body: 'The SafePass QR on each vehicle lets a passenger confirm it is a registered, documented vehicle before they board.' },
      { title: 'Journeys are watched by people', body: 'Not a tracker nobody is looking at — an officer follows the trip and escalates if something changes.' },
      { title: 'Arrival is confirmed, not assumed', body: 'Whoever is waiting for that passenger is told when they arrive.' },
    ] satisfies ContentCard[],
  },

  /**
   * Cost and onboarding — FEAT-011 AC2 requires these be addressed directly,
   * and screens/04 requires the framing stay non-committal ("subscription and
   * per-trip options available — talk to us"). No figures are invented here:
   * fleet pricing is not published anywhere in the docs.
   */
  costOnboarding: {
    heading: 'Cost and effort, straight away',
    lead: 'The two questions every operator asks first.',
    points: [
      {
        title: 'What does it cost my business?',
        body: 'Both subscription and per-trip options are available, and the right one depends on your fleet size and how often your vehicles run. We would rather quote you properly than publish a number that does not fit your operation — tell us your fleet size and we will be specific.',
      },
      {
        title: 'How much operational work is this?',
        body: 'Onboarding is registering your vehicles and drivers and uploading their documents for verification. After that, monitoring runs against journeys linked to your vehicles — it does not add a step to how your drivers already work.',
      },
    ] satisfies ContentCard[],
  },

  inquiry: {
    heading: 'Partner with us',
    lead: 'Tell us about your fleet and we will come back with options that fit how you actually operate.',
  },
} as const;
