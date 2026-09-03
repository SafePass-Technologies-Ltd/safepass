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
  eyebrow: 'Road Journey Assurance for travellers',
  heading: 'Every journey deserves someone watching over it.',
  lead: 'Register your journey before you set off, and a trained SafePass monitoring officer follows it live from departure to arrival. You and the people who care about you get the certainty that someone knows where you are and will act if something goes wrong.',

  /**
   * Four use cases. FEAT-006's second criterion historically named the two
   * documented in `docs/SafePass/README.md` (inter-city, high-risk corridor);
   * "Local journeys" and "When someone is waiting for you" were added on client
   * feedback. The point is to communicate that SafePass protects journeys that
   * matter wherever they happen, not only "dangerous roads" — so the section
   * is deliberately open-ended, and more use cases can be added later without
   * redesigning it.
   */
  useCases: [
    {
      title: 'Inter-city travel',
      body: 'Travelling between cities often means long hours on unfamiliar roads, limited mobile coverage in places, and fewer people who know exactly where you are. SafePass monitors your journey from departure to arrival and lets your trusted contacts know when you’ve arrived safely.',
    },
    {
      title: 'High-risk corridor travel',
      body: 'Some routes have a known history of security incidents. SafePass displays verified safety information along your route while a monitoring officer follows your journey in real time, ready to respond if something unexpected happens.',
    },
    {
      title: 'Local journeys',
      body: 'Not every journey that matters crosses state borders. Whether you’re visiting someone, meeting a person for the first time, travelling across town, heading home late, or going somewhere unfamiliar, SafePass helps ensure someone knows where you’re going and is watching until you arrive safely.',
    },
    {
      title: 'When someone is waiting for you',
      body: 'Sometimes the journey matters simply because someone is expecting you home. Whether it’s family, friends or colleagues, SafePass provides the certainty that someone is watching your trip and confirms when you’ve arrived, or responds quickly if something doesn’t go according to plan.',
    },
  ] satisfies ContentCard[],

  /** Pricing is stated openly — FEAT-006 AC1 forbids hiding it behind signup. */
  pricing: {
    heading: 'Simple, transparent pricing',
    lead: 'No subscriptions. No hidden charges. Pay only for the journeys you choose to monitor.',
    /**
     * A row of reassurance badges answering the "am I signing up for another
     * recurring payment?" question before it is asked. "Wallet never expires"
     * is deliberately NOT included: that is a policy decision the business has
     * not confirmed, and asserting an unconfirmed policy would be inventing a
     * claim. Everything else here is documented in monetization.md.
     */
    reassurances: [
      'No subscription',
      'Pay per journey',
      'No hidden charges',
      'Transparent pricing',
    ],
    items: [
      {
        value: '₦2,000',
        label: 'Per monitored journey',
        // monetization.md is precise about WHEN: deducted when monitoring
        // begins, not when the traveller taps "Start Journey". Stating it
        // loosely would misdescribe a real charge.
        detail:
          'A single monitored trip from departure to arrival. Deducted from your wallet when monitoring actually begins, and you only pay for journeys you register.',
      },
      {
        value: '₦2,000',
        label: 'Minimum wallet top-up',
        detail: 'Add funds when you need them. Your wallet is used only for journeys you register, so top up to start your first monitored journey.',
      },
    ],
    /** The value box that reframes the ₦2,000 figure before the price is read. */
    includesHeading: 'Every monitored journey includes',
    includes: [
      'A live SafePass monitoring officer',
      'Real-time journey tracking',
      'Route monitoring',
      'Emergency escalation if required',
      'Arrival confirmation',
      'A secure journey record',
    ],
    footnote:
      'The price you see is the price you pay. No subscriptions, no trial that later converts into a paid plan, and no hidden charges. Just pay for the journeys that matter.',
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
  eyebrow: 'Road Journey Assurance for business',
  heading: 'Know every employee arrived safely.',
  lead: 'SafePass gives organisations real-time oversight of employee road travel, so you can prove you met your duty of care. You get a complete audit trail of every registered journey, monitored live by a SafePass officer, with arrival confirmations and escalation.',

  /** Use cases across the journeys organisations actually monitor. */
  useCases: [
    {
      title: 'Staff travel between branches',
      body: 'Employees moving between offices or sites on inter-city roads. Register the journey, and the trip is monitored end to end with arrival confirmed rather than assumed.',
    },
    {
      title: 'Field operations',
      body: 'Teams working away from a fixed site (field engineers, assessors, NGO staff in remote areas). Each journey is watched live, with escalation if contact is lost.',
    },
    {
      title: 'Executive & VIP travel',
      body: 'Executives, directors and visiting partners travelling to meetings, government offices, airports or project sites receive the same monitored protection and arrival confirmation.',
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
    lead: 'A dashboard for whoever owns staff safety, not another inbox to watch.',
    capabilities: [
      { title: 'People & team management', body: 'Add the people who travel and manage who belongs to your organisation.' },
      { title: 'Trip registration for staff', body: 'Register journeys on behalf of employees, so monitoring does not depend on someone remembering to do it themselves.' },
      { title: 'Live trip monitoring', body: 'See journeys in progress and their current status as officers track them.' },
      { title: 'Alert reception', body: 'Receive alerts when a monitored journey escalates, routed to the people responsible for responding.' },
      { title: 'Trip history and reports', body: 'A record of completed journeys for internal reporting and review.' },
      { title: 'Journey analytics', body: 'Monitor travel patterns, identify high-risk routes and generate reports to support operational planning and duty-of-care compliance.' },
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
      { title: 'Access is role-based', body: 'Administrators only see information appropriate to their role, and access permissions can be restricted by organisation.' },
      { title: 'Emergency evidence is retained deliberately', body: 'Where an emergency is triggered, SafePass captures evidence so there is a record afterwards. Retention and access are covered in our Privacy Policy.' },
      { title: 'Monitoring is staffed, and staff are accountable', body: 'Journeys are watched by SafePass officers operating under internal access controls, rather than being visible to anyone with an account.' },
    ] satisfies ContentCard[],
    /** Points at the real policy rather than restating it — that page is authoritative. */
    policyNote: 'Full detail, including retention periods and data-subject rights, is in our Privacy Policy.',
  },

  /**
   * The industries SafePass is built for — a "Suitable for organisations like…"
   * section so a visitor recognises their own sector immediately. No claims are
   * made beyond fit; this is legibility, not a customer list.
   */
  suitableFor: {
    heading: 'Suitable for organisations like…',
    lead: 'If your people travel for work, SafePass is built for your kind of organisation.',
    industries: [
      'Oil & Gas',
      'Construction',
      'Mining',
      'NGOs',
      'Logistics',
      'Healthcare',
      'Education',
      'Financial Services',
      'Government',
    ],
  },

  /**
   * The "why organisations choose SafePass" comparison — the ad-hoc alternatives
   * versus what SafePass gives. Client feedback: it is the single most
   * persuasive element on the page. No figures here, just a side-by-side of
   * common practice versus a monitored journey.
   */
  comparison: {
    heading: 'Why organisations choose SafePass',
    lead: 'What most teams rely on today, and what a monitored journey replaces.',
    rows: [
      { other: 'Driver calls when they remember', safepass: 'Live monitored journey' },
      { other: 'WhatsApp location sharing', safepass: 'Dedicated monitoring officer' },
      { other: 'Phone calls', safepass: 'Dashboard' },
      { other: 'Manual follow-up', safepass: 'Automated arrival confirmation' },
      { other: 'No records', safepass: 'Full audit history' },
      { other: 'No escalation', safepass: 'Emergency response workflow' },
    ],
  },

  /**
   * Announced call-outs for the dashboard preview image, so a visitor reads a
   * dashboard the way its operators do. Delivered as a numbered legend rather
   * than absolute overlay markers on the image: it is a placeholder mockup, so
   * overlay numbers could not be reliably positioned over real elements, and a
   * legend is robust to the asset swapping to a real screenshot later.
   */
  dashboardCallouts: [
    'Active journeys',
    'Emergency alerts',
    'Live officer monitoring',
    'Incident history',
    'Messaging',
  ],

  /**
   * Reassurance strip for procurement / legal reviewers — client-requested.
   * Feature and behaviour items are stated plainly. The two legal-certification
   * claims ("GDPR aligned", "NDPA compliant") are client-directed but appear in
   * code only once flagged for counsel sign-off before production (see
   * IMPLEMENTATION.md §6a — legal assertions are not made by an engineer).
   */
  assurance: {
    heading: 'Built for procurement and legal review',
    lead: 'The questions your security and procurement teams will ask, answered up front.',
    items: [
      'Corporate dashboards',
      'Audit logs',
      'Role-based access',
      'Journey history',
    ],
    /**
     * The legal-certification claims the client requested. Kept in the data
     * model but NOT rendered because they are assertions only the business and
     * counsel can make; flipping `renderLegalCertifications` to true (and adding
     * the two labels to `items`) is the one-line switch after legal sign-off.
     */
    renderLegalCertifications: false,
  },

  /**
   * Illustrative case study — client-requested. The figures are explicitly
   * labelled as an example so they are never read as published SafePass
   * operational data (risk_log.md R-007). Swap in real pilot numbers before
   * relaunching this as evidence rather than illustration.
   */
  caseStudy: {
    label: 'Illustrative example',
    heading: 'What a monitored operation looks like',
    org: 'A 120-person field team across Abuja and Kaduna',
    metrics: [
      { value: '324', label: 'Monitored journeys' },
      { value: '100%', label: 'Arrival confirmation' },
      { value: '2', label: 'Emergency escalations' },
      { value: '4 min', label: 'Average response time' },
    ],
    note: 'Illustrative figures shown to demonstrate the reporting a monitored operation produces. Real pilot data will be published here when available.',
  },

  overview: {
    heading: 'Build your internal business case',
    body: 'A one-page summary of what SafePass does, how monitoring works, and what it costs, formatted to print or save as a PDF and forward internally.',
    ctaLabel: 'Open the one-page overview',
  },

  demo: {
    heading: 'Let’s discuss your travel operations',
    lead: 'Tell us how your people travel and we will walk you through what monitoring would look like for your organisation.',
  },
} as const;

// -----------------------------------------------------------------------------
// Transport partner (FEAT-011) — screens/04
// -----------------------------------------------------------------------------

export const TRANSPORT_CONTENT = {
  eyebrow: 'Road Journey Assurance for transport partners',
  heading: 'Become Nigeria’s most trusted transport operator.',
  lead: 'SafePass helps transport operators build passenger trust through verified vehicles, verified drivers and live monitored journeys handled by real SafePass officers, not just GPS tracking.',

  /**
   * Capability list from the Transport Partner Dashboard's v1.0 scope in
   * `docs/SafePass/README.md`. FEAT-011 AC1 requires vehicle/driver management
   * and QR verification specifically.
   *
   * NOTE: "Driver Verification History" was proposed on client feedback
   * ("passengers can see whether the assigned driver matches the verified
   * driver") but is NOT shipped: the QR verification page deliberately never
   * exposes driver data (see apps/api verify.routes.ts — "Never exposes
   * driver, passenger, or location data"), and no driver-verification-history
   * view exists in the transport dashboard. Shipping it would be an unbacked
   * claim (Non-Negotiable 5). Removed from the card list; recorded as a
   * product gap to build if the feature is commissioned.
   */
  fleet: {
    heading: 'Vehicles and drivers',
    lead: 'Your fleet, registered and verifiable.',
    capabilities: [
      { title: 'Vehicle management', body: 'Register each vehicle in your fleet and keep its details current in one place.' },
      { title: 'SafePass QR per vehicle', body: 'Every registered vehicle gets its own SafePass QR code, so a passenger can check they are in the vehicle they were told they would be in.' },
      { title: 'Driver management', body: 'Register drivers and keep their records attached to the vehicles they operate.' },
      { title: 'Document verification', body: 'Upload compliance documents (registration, insurance, roadworthiness, licences) for verification.' },
      { title: 'Linked trip monitoring', body: 'See journeys linked to your vehicles as they are monitored.' },
      { title: 'Safety alerts', body: 'Receive alerts when a journey involving one of your vehicles escalates.' },
    ] satisfies ContentCard[],
  },

  /**
   * FEAT-011 AC3 — the passenger-facing differentiator as a marketable claim.
   * Renamed on client feedback to lead with the passenger-trust outcome. The
   * "Emergency response starts immediately" point was added: officers already
   * hold the journey, passenger, and vehicle detail, so escalation begins
   * without waiting for someone to explain where they are.
   */
  differentiator: {
    heading: 'Why passengers trust monitored operators',
    lead: 'Passengers choosing between operators have very little to go on. Monitored journeys give them something concrete.',
    points: [
      { title: 'Passengers can verify the vehicle', body: 'The SafePass QR on each vehicle lets a passenger confirm it is a registered, documented vehicle before they board.' },
      { title: 'Journeys are watched by people', body: 'Not a tracker nobody is looking at. An officer follows the trip and escalates if something changes.' },
      { title: 'Arrival is confirmed, not assumed', body: 'Whoever is waiting for that passenger is told when they arrive.' },
      { title: 'Emergency response starts immediately', body: 'If something goes wrong, monitoring officers already have the journey details, passenger information and vehicle information to begin escalation without waiting for someone to explain where they are.' },
    ] satisfies ContentCard[],
  },

  /**
   * "Why operators partner with SafePass" — a short persuasive summary (client
   * feedback). These are the operator-side outcomes, distinct from the
   * passenger-facing differentiator above. Each is a capability/benefit claim,
   * not a metric, so nothing needs a source or as-of date (R-007).
   */
  partnerBenefits: {
    heading: 'Why operators partner with SafePass',
    lead: 'The advantages a monitored fleet gives you, all in one place.',
    items: [
      'Differentiate from competitors',
      'Build passenger trust',
      'Reduce incident response time',
      'Verified vehicles',
      'Verified drivers',
      'Live journey oversight',
      'Better brand reputation',
    ],
  },

  /**
   * The QR code section — client feedback calls the per-vehicle QR "brilliant"
   * and says it is undersold, so it gets its own section. A vehicle carrying a
   * unique SafePass identity is one of the biggest selling points. Future asset:
   * the physical "SafePass Verified Journey" sticker visual (see §6a flag).
   */
  vehicleIdentity: {
    heading: 'Every vehicle gets its own SafePass identity',
    lead: 'Every registered vehicle receives a unique SafePass QR code. Passengers scan it before boarding to confirm:',
    checks: [
      'this is the correct vehicle',
      'it belongs to the operator',
      'documents are current',
      'driver is verified',
      'monitored journey available',
    ],
    note: 'Passengers begin to look for that sticker the way they look for a safety rating. That is branding you can own.',
  },

  /**
   * The segments SafePass vehicles fit — client feedback: the page read too
   * bus-focused, so it now names the fleet types it serves. Doubles the
   * addressable market without claiming any specific operator.
   */
  suitableFor: {
    heading: 'Suitable for',
    lead: 'Any fleet where a journey matters, from luxury coaches to logistics personnel transport.',
    industries: [
      'Luxury buses',
      'School buses',
      'Employee shuttle fleets',
      'Hotel shuttles',
      'Airport transfers',
      'Tourist operators',
      'Corporate transport',
      'Ride-hailing fleets',
      'Staff buses',
      'Logistics personnel transport',
    ],
  },

  /**
   * Cost and onboarding — FEAT-011 AC2 requires these be addressed directly,
   * and screens/04 requires the framing stay non-committal ("subscription and
   * per-trip options available — talk to us"). No figures are invented here:
   * fleet pricing is not published anywhere in the docs. The "will passengers
   * install SafePass?" question answers the biggest customer-friction concern
   * (client feedback).
   */
  costOnboarding: {
    heading: 'Cost and effort, straight away',
    lead: 'The questions every operator asks first.',
    points: [
      {
        title: 'What does it cost my business?',
        body: 'Both subscription and per-trip options are available, and the right one depends on your fleet size and how often your vehicles run. We would rather quote you properly than publish a number that does not fit your operation. Tell us your fleet size and we will be specific.',
      },
      {
        title: 'How much operational work is this?',
        body: 'Onboarding is registering your vehicles and drivers and uploading their documents for verification. After that, monitoring runs against journeys linked to your vehicles. It does not add a step to how your drivers already work.',
      },
      {
        title: 'Will passengers have to install SafePass?',
        body: 'No. Passengers only install the SafePass app if they want monitored journeys and journey notifications. Vehicle verification through the SafePass QR code works without changing your existing booking process.',
      },
    ] satisfies ContentCard[],
  },

  inquiry: {
    heading: 'Partner with us',
    lead: 'Tell us about your fleet and we will come back with options that fit how you actually operate.',
  },
} as const;
