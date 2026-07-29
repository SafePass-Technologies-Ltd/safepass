import { clientEnv } from '@/lib/env';
import type { LegalDocument } from './types';

/**
 * Terms of Service content — screens/07-terms-of-service.md, FEAT-015.
 *
 * ============================ READ BEFORE EDITING ============================
 * TODO: legal review — EVERY `body` paragraph below is PLACEHOLDER PROSE
 * describing what the section must cover. None of it is a binding term.
 *
 * Section STRUCTURE is real and reflects screens/07's stated scope: these terms
 * govern use of THIS WEBSITE only. The SafePass mobile app and dashboards have
 * their own terms, and this document must never be read as covering the
 * monitoring service, the wallet, or journey fees.
 *
 * Supplied by counsel, never by an engineer: the licence grant and its limits,
 * warranty disclaimers, any limitation or cap on liability, indemnity wording,
 * and the governing-law and dispute-resolution clauses. Drafting those here
 * would be inventing binding commitments.
 * =============================================================================
 */
export const termsOfService: LegalDocument = {
  title: 'Terms of Service',
  description:
    'The terms governing your use of the SafePass website. The SafePass mobile app and dashboards are covered by separate in-product terms.',
  lastUpdated: '2026-07-27',
  showTableOfContents: true,
  intro: [
    // TODO: legal review
    'These terms apply to your use of the SafePass website. By using this site you agree to them.',
    // TODO: legal review
    'These terms cover this website only. The SafePass mobile app, the corporate and transport-partner dashboards, and the monitoring service itself are governed by separate terms presented within those products.',
  ],
  sections: [
    {
      id: 'acceptance',
      heading: 'Acceptance of These Terms',
      needsLegalReview: true,
      body: [
        // TODO: legal review
        'By accessing or using this website you accept these terms. If you do not accept them, please do not use the site.',
      ],
    },
    {
      id: 'scope',
      heading: 'What These Terms Cover',
      needsLegalReview: true,
      body: [
        // TODO: legal review. The scope statement itself is accurate — it comes
        // directly from screens/07 and the README's explicit non-goals.
        'This website is an informational and enquiry site. It describes the SafePass product, links to the app stores, and lets you contact us. It does not provide trip monitoring, location tracking, emergency escalation, payment, or account functionality of any kind.',
      ],
    },
    {
      id: 'use-of-site',
      heading: 'Use of the Site',
      needsLegalReview: true,
      body: [
        // TODO: legal review
        'You agree to use this site lawfully and not to interfere with its operation, attempt to gain unauthorised access to it, or use it to send unlawful or abusive content through our enquiry forms.',
      ],
    },
    {
      id: 'information-you-submit',
      heading: 'Information You Submit',
      needsLegalReview: true,
      body: [
        // TODO: legal review
        'When you submit an enquiry, demo request, partner enquiry, or waitlist signup, you confirm that the information you provide is accurate and that you are entitled to provide it — including where it relates to an organisation you represent. How we handle that information is described in our Privacy Policy.',
      ],
    },
    {
      id: 'intellectual-property',
      heading: 'Intellectual Property',
      needsLegalReview: true,
      body: [
        // TODO: legal review — the exact scope of any licence to site content,
        // and permitted use of the SafePass name and marks, must be set by
        // counsel. No licence terms are stated here on purpose.
        'The content, design, and branding of this site belong to SafePass or its licensors. This section sets out what you may and may not do with that material.',
      ],
    },
    {
      id: 'third-party-links',
      heading: 'Third-Party Links and App Stores',
      needsLegalReview: true,
      body: [
        // TODO: legal review
        'This site links to third-party services, including the Apple App Store and Google Play. We do not control those services, and your use of them is governed by their own terms and privacy policies.',
      ],
    },
    {
      id: 'accuracy-of-content',
      heading: 'Accuracy of Site Content',
      needsLegalReview: true,
      body: [
        // TODO: legal review. The substance here is a real product commitment
        // from FEAT-005 / risk_log R-007 — published safety statistics carry a
        // source and an as-of date — so it is stated plainly rather than as a
        // disclaimer of everything.
        'Safety and incident information published on this site is provided for general information. Where we publish a statistic we show its source and the date it was current. Site content may change, and it is not a substitute for the alerts and guidance delivered inside the SafePass product.',
      ],
    },
    {
      id: 'disclaimers',
      heading: 'Disclaimers',
      needsLegalReview: true,
      body: [
        // TODO: legal review — warranty disclaimer wording must be drafted by
        // counsel.
        'This section sets out the warranties we give and disclaim in relation to this website.',
      ],
    },
    {
      id: 'liability',
      heading: 'Limitation of Liability',
      needsLegalReview: true,
      body: [
        // TODO: legal review — DO NOT state a liability cap or exclusion here.
        // Any figure or carve-out must come from counsel.
        'This section sets out the limits of our liability in connection with your use of this website, to the extent permitted by Nigerian law.',
      ],
    },
    {
      id: 'changes-to-site',
      heading: 'Changes to the Site and These Terms',
      needsLegalReview: true,
      body: [
        // TODO: legal review
        'We may change, suspend, or withdraw parts of this site, and we may update these terms. The date at the top of this page shows when they were last updated.',
      ],
    },
    {
      id: 'governing-law',
      heading: 'Governing Law',
      needsLegalReview: true,
      body: [
        // TODO: legal review — governing law and the dispute-resolution forum
        // must be confirmed by counsel rather than assumed from the market.
        'This section states the law governing these terms and how disputes relating to them are resolved.',
      ],
    },
    {
      id: 'contact',
      heading: 'Contact Us',
      body: [
        // Not placeholder: the contact route is real and configured.
        `Questions about these terms can be sent to ${clientEnv.fallbackContactEmail}.`,
      ],
    },
  ],
  relatedLinks: [
    { href: '/privacy', label: 'Privacy Policy' },
    { href: '/about', label: 'About SafePass' },
    { href: '/', label: 'Back to homepage' },
  ],
};
