import { clientEnv } from '@/lib/env';
import type { LegalDocument } from './types';

/**
 * About page content — screens/08-about.md, FEAT-015.
 *
 * Unlike the Privacy Policy and Terms, this copy is REAL, not placeholder. It
 * is written from `docs/SafePassLanding/README.md` and `docs/SafePass/README.md`
 * and states nothing that isn't in one of them.
 *
 * screens/08's Edge Case is the actual bar here: "a thin, generic 'About Us'
 * page fails this screen's actual purpose even if technically complete". Tunde
 * (corporate security buyer) and Chidinma (transport operator) read this page
 * during vendor due-diligence, so it explains what the platform is, how the
 * monitoring model actually works, how safety data is verified, and who each
 * part of the product serves — enough substance to be forwarded internally.
 *
 * DELIBERATELY ABSENT, because no doc records them and inventing them for a
 * due-diligence page would be worse than omitting them: registered company
 * name and RC number, registered address, incorporation date, founder or team
 * names, headcount, funding, and any customer or partner logos. Reported as a
 * content gap rather than filled in.
 */
export const about: LegalDocument = {
  title: 'About SafePass',
  description:
    'SafePass is a safety-focused satnav platform for road travel in Nigeria, combining live human monitoring, verified incident intelligence, and emergency evidence capture.',
  lastUpdated: '2026-07-27',
  showTableOfContents: false,
  intro: [
    'SafePass is a safety-focused satnav platform for road travel in Nigeria. Where a conventional navigation app answers "what is the fastest route", SafePass answers "is this journey safe, and is anyone watching it" — layering live human monitoring and verified incident intelligence on top of navigation.',
    'Our tagline is the shortest statement of why the company exists: Every Journey Matters.',
  ],
  sections: [
    {
      id: 'what-we-do',
      heading: 'What We Do',
      body: [
        'A traveller registers a journey in the SafePass app, and that journey is monitored from departure to arrival. During the trip the traveller shares live location, receives route safety alerts for high-risk corridors and known hotspots, confirms checkpoints, reports incidents, and can message a SafePass monitoring officer directly.',
        'If something goes wrong, a panic trigger escalates the journey and begins silent background audio recording, so evidence is preserved even in a situation where the traveller cannot safely use their phone.',
      ],
    },
    {
      id: 'how-we-are-different',
      heading: 'How We Are Different',
      body: [
        'Four things separate SafePass from a tracking app with a map in it.',
      ],
      list: [
        'Safety-first navigation — route alerts driven by risk, not only by traffic.',
        'Human-in-the-loop monitoring — real monitoring officers watching active journeys, not only automated alerting. A missed check-in is seen by a person.',
        'An incident intelligence network — checkpoints, attacks, and hazards are reported and verified rather than taken at face value.',
        'Emergency evidence capture — silent background recording on panic trigger, so an incident leaves a record.',
      ],
    },
    {
      id: 'how-safety-data-is-verified',
      heading: 'How Our Safety Data Is Verified',
      body: [
        'The credibility of a safety product rests entirely on the credibility of its data, so we treat verification as part of the product rather than as a disclaimer. Incident and checkpoint reports move through a verification process before they influence what a traveller is shown, and our monitoring team curates map markers directly — which is also how the safety map is seeded in a new corridor before enough travellers are using it to sustain itself.',
        'Every safety statistic we publish on this site carries its source and the date it was current. If we cannot show you where a number came from, we do not publish it.',
      ],
    },
    {
      id: 'who-we-serve',
      heading: 'Who We Serve',
      body: [
        'SafePass is one platform with four surfaces, because the people who need road safety in Nigeria need it in different shapes.',
      ],
      list: [
        'Individual travellers — the mobile app, for inter-city journeys and travel through high-risk corridors.',
        'Corporate clients — a corporate dashboard for staff management, journey registration, live monitoring, and reporting. Built for organisations moving people: banks between branches, oil and gas field operations, NGOs with staff in remote areas.',
        'Commercial transport partners — a partner dashboard for vehicle and driver management, document verification, and monitoring of linked journeys, for bus companies, fleet operators, and logistics firms.',
        'SafePass monitoring officers — the internal admin dashboard where live journeys are watched, incidents are managed, and escalations are handled.',
      ],
    },
    {
      id: 'where-we-operate',
      heading: 'Where We Operate',
      body: [
        'Nigeria is our initial market, and the product is built around Nigerian road travel specifically — the corridors, the checkpoint reality, and the incident patterns that travellers here actually face. Pan-African expansion is on our roadmap beyond the initial launch.',
      ],
    },
    {
      id: 'working-with-us',
      heading: 'Working With Us',
      body: [
        'If you are evaluating SafePass for an organisation — staff travel, fleet safety, or passenger safety — we would rather have a conversation than have you piece it together from a brochure. Corporate and transport-partner enquiries go to a person, not an autoresponder.',
        `You can reach us at ${clientEnv.fallbackContactEmail}.`,
      ],
    },
  ],
  relatedLinks: [
    { href: '/business', label: 'SafePass for business' },
    { href: '/transport-partners', label: 'SafePass for transport partners' },
    { href: '/how-we-verify', label: 'How we verify safety data' },
    { href: '/privacy', label: 'Privacy Policy' },
    { href: '/terms', label: 'Terms of Service' },
  ],
};
