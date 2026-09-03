import { clientEnv } from '@/lib/env';
import type { LegalDocument } from './types';

/**
 * Privacy Policy content — screens/06-privacy-policy.md, FEAT-015.
 *
 * ============================ READ BEFORE EDITING ============================
 * TODO: legal review — EVERY `body` paragraph in the sections below is
 * PLACEHOLDER PROSE describing what the section must cover. It is deliberately
 * NOT a binding privacy commitment.
 *
 * The section STRUCTURE is real: it covers the disclosures the Nigeria Data
 * Protection Act / NDPR framework expects of a data controller — categories of
 * personal data collected, purpose, lawful basis, third-party sharing,
 * retention, security, transfers, data-subject rights, and a contact route for
 * exercising them.
 *
 * What is deliberately absent, and must be supplied by counsel rather than by
 * an engineer: concrete retention periods, the named lawful basis per
 * processing purpose, the identities of processors and sub-processors, the
 * transfer mechanism for any processing outside Nigeria, and the DPO/contact
 * designation. Inventing any of those would be fabricating a regulatory claim.
 *
 * risk_log.md R-011 makes this page a launch-blocking prerequisite for
 * FEAT-008 / FEAT-010 / FEAT-012's lead-capture forms. The page being live and
 * reachable is satisfied by this file; the copy being reviewed is not, and the
 * on-page notice says so until it is.
 * =============================================================================
 */
export const privacyPolicy: LegalDocument = {
  title: 'Privacy Policy',
  description:
    'How SafePass collects, uses, shares, and protects personal information submitted through this website, and the rights you have over that information.',
  lastUpdated: '2026-07-27',
  showTableOfContents: true,
  intro: [
    // TODO: legal review
    'This policy explains how SafePass handles personal information collected through this website. It covers the information you give us directly (for example when you request a demo, submit a partner enquiry, or join a waitlist) and information collected automatically as you browse.',
    // TODO: legal review
    'This website does not perform any trip monitoring, location tracking, or emergency functionality. Personal information handled inside the SafePass mobile app and dashboards is governed separately by the in-product privacy notice.',
  ],
  sections: [
    {
      id: 'who-we-are',
      heading: 'Who We Are',
      needsLegalReview: true,
      body: [
        // The entity name ("SafePass Technologies Ltd") and data-controller
        // framing are client-supplied. The RC number and registered office are
        // NOT supplied and must come from the company — see the details block.
        'SafePass Technologies Ltd operates this website and acts as the data controller for information collected through it. Our registered company details are set out below.',
      ],
      list: [
        'Registered company: SafePass Technologies Ltd',
        // TODO: legal review — RC number must be supplied by the company.
        'RC number: to be confirmed',
        // TODO: legal review — registered office must be supplied by the company.
        'Registered office: to be confirmed',
        'Country: Nigeria',
        `Email: ${clientEnv.fallbackContactEmail}`,
      ],
    },
    {
      id: 'information-we-collect',
      heading: 'Information We Collect',
      needsLegalReview: true,
      body: [
        // TODO: legal review
        'We collect the following categories of information through this website.',
      ],
      // Split into visually distinct groups so a visitor can skim what they
      // provide vs what is collected automatically (client feedback).
      listGroups: [
        {
          heading: 'Information you provide',
          items: [
            'Your name and email address, and, depending on the form, your phone number, company or organisation name, organisation size, fleet size, city or region, and any free-text description you choose to include.',
          ],
        },
        {
          heading: 'Information collected automatically',
          items: [
            'IP address, browser and device type, referring page, and pages viewed when you visit.',
            'Information from cookies and similar technologies, as described below.',
          ],
        },
      ],
    },
    {
      id: 'how-we-use-information',
      heading: 'How We Use Your Information',
      needsLegalReview: true,
      body: [
        // TODO: legal review
        'We use the information you submit to respond to your enquiry, to contact you about SafePass, and to operate, secure, and improve this website. We use technical and analytics information to understand how the site is used so that it can be made clearer and faster.',
      ],
      // Rendered as a visually strong statement a skimming reader cannot miss
      // (client feedback: "Many users skim. Seeing this immediately creates
      // trust.").
      emphasis: ['We do not sell your personal information.'],
    },
    {
      id: 'lawful-basis',
      heading: 'Lawful Basis for Processing',
      needsLegalReview: true,
      body: [
        // TODO: legal review — the specific lawful basis relied on for each
        // processing purpose under the Nigeria Data Protection Act must be
        // stated by counsel. Asserting one here would be a regulatory claim.
        'We process personal information on the lawful bases permitted under Nigerian data protection law. The specific basis relied on for each processing purpose is set out in this section.',
      ],
    },
    {
      id: 'cookies',
      heading: 'Cookies and Analytics',
      needsLegalReview: true,
      body: [
        // TODO: legal review
        'This website uses cookies and similar technologies that are necessary for the site to function, and (where applicable) analytics technologies that help us understand aggregate site usage. This section describes the categories in use, their purpose, and how you can control them through your browser.',
      ],
    },
    {
      id: 'sharing',
      heading: 'How We Share Information',
      needsLegalReview: true,
      body: [
        // TODO: legal review — the named processors (hosting, email delivery,
        // CRM, analytics) must be listed by the company before launch.
        'Information you submit through this website is forwarded to SafePass systems so that our team can respond to you. We also use service providers that process information on our behalf, for example hosting, email delivery, and customer-relationship tooling. These providers may only process information on our instructions.',
        // The "never sell/rent to advertisers or data brokers" statement is the
        // sentence people actively look for (client feedback).
        'We never sell or rent personal information to advertisers or data brokers.',
        // TODO: legal review
        'We may disclose information where we are legally required to do so, or to establish, exercise, or defend legal claims.',
      ],
    },
    {
      id: 'retention',
      heading: 'How Long We Keep Information',
      needsLegalReview: true,
      body: [
        // TODO: legal review — DO NOT state a specific retention period here.
        // No retention schedule exists in the docs, and inventing one would be
        // a binding commitment made up by an engineer.
        'We keep personal information only for as long as it is needed for the purposes described in this policy, or for as long as we are required to keep it by law. The retention periods that apply to each category of information are set out in this section.',
      ],
    },
    {
      id: 'security',
      heading: 'How We Protect Information',
      needsLegalReview: true,
      body: [
        // Client feedback: lead with the positive measures, end with the
        // limitation — "Lead with strength. End with limitation."
        'We protect information using encryption, access controls, authentication, logging, and organisational security procedures appropriate to the sensitivity of the data.',
        // TODO: legal review
        'Although no system can guarantee absolute security, we work to keep the information we hold secure and to respond promptly if a risk is identified.',
      ],
    },
    {
      id: 'international-transfers',
      heading: 'International Transfers',
      needsLegalReview: true,
      body: [
        // TODO: legal review — the transfer mechanism relied on must be named
        // by counsel, not assumed.
        'Some of our service providers may process information outside Nigeria. Where that happens, we rely on a transfer mechanism permitted under Nigerian data protection law, described in this section.',
      ],
    },
    {
      id: 'your-rights',
      heading: 'Your Rights',
      needsLegalReview: true,
      body: [
        // TODO: legal review — the rights listed below are the standard NDPR
        // data-subject rights; the process and response time for exercising
        // them must be confirmed by the company.
        'Subject to Nigerian data protection law, you have rights over the personal information we hold about you.',
      ],
      // Rendered with a check mark beside each right so the list is scannable
      // at a glance (client feedback).
      listStyle: 'check',
      list: [
        'Access: ask what personal information we hold about you and obtain a copy of it.',
        'Correction: ask us to correct information that is inaccurate or incomplete.',
        'Deletion: ask us to delete your information in the circumstances the law allows.',
        'Restriction: object to, or ask us to restrict, certain processing.',
        'Withdrawal: withdraw consent where our processing relies on your consent.',
        'Portability: ask us to transfer your information to you or another controller in a portable format.',
        'Complaint: complain to the Nigeria Data Protection Commission.',
      ],
    },
    {
      id: 'childrens-privacy',
      heading: "Children's Privacy",
      needsLegalReview: true,
      body: [
        // TODO: legal review
        'This website is not directed at children, and we do not knowingly collect personal information from children through it.',
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to This Policy',
      needsLegalReview: true,
      body: [
        // TODO: legal review
        'We may update this policy from time to time. The date at the top of this page shows when it was last updated, and material changes will be highlighted here.',
      ],
    },
    {
      id: 'contact',
      heading: 'Contact Us',
      body: [
        // Not placeholder: the contact route is real and configured.
        `If you have a question about this policy or want to exercise any of the rights above, contact us at ${clientEnv.fallbackContactEmail}.`,
        // Response-time commitment makes the company appear operational
        // (client feedback). Legal-review flag is NOT set: the commitment is
        // an operational promise the company chooses to make.
        'We aim to respond to privacy enquiries within 30 days.',
      ],
    },
    {
      id: 'privacy-commitment',
      heading: 'Our Privacy Commitment',
      body: [
        // The trust statement (client feedback): "That's not legal. That's
        // trust. And SafePass is selling trust."
        'SafePass exists to improve personal safety, not to exploit personal information. We collect only the information needed to operate our services, protect users, and respond to enquiries. We never sell personal information, and we design our systems to minimise data collection wherever practical.',
      ],
    },
  ],
  relatedLinks: [
    { href: '/terms', label: 'Terms of Service' },
    { href: '/about', label: 'About SafePass' },
    { href: '/', label: 'Back to homepage' },
  ],
};
