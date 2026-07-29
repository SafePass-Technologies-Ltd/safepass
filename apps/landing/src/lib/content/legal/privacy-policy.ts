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
    'This policy explains how SafePass handles personal information collected through this website. It covers the information you give us directly — for example when you request a demo, submit a partner enquiry, or join a waitlist — and information collected automatically as you browse.',
    // TODO: legal review
    'This website does not perform any trip monitoring, location tracking, or emergency functionality. Personal information handled inside the SafePass mobile app and dashboards is governed separately by the in-product privacy notice.',
  ],
  sections: [
    {
      id: 'who-we-are',
      heading: 'Who We Are',
      needsLegalReview: true,
      body: [
        // TODO: legal review — the registered entity name, RC number, and registered
        // address must be supplied by the company; none are recorded in the docs.
        'SafePass operates this website and is the data controller for personal information submitted through it. Our registered company details and registered address are set out at the end of this policy.',
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
      list: [
        // The field lists below ARE accurate — they mirror schema.md's lead
        // contracts, which is what the forms actually submit.
        'Information you submit in a form: your name, email address, and — depending on the form — your phone number, company or organisation name, organisation size, fleet size, city or region, and any free-text description you choose to include.',
        'Technical information collected automatically when you visit: IP address, browser and device type, referring page, and pages viewed.',
        'Information from cookies and similar technologies, as described below.',
      ],
    },
    {
      id: 'how-we-use-information',
      heading: 'How We Use Your Information',
      needsLegalReview: true,
      body: [
        // TODO: legal review
        'We use the information you submit to respond to your enquiry, to contact you about SafePass, and to operate, secure, and improve this website. We use technical and analytics information to understand how the site is used so that it can be made clearer and faster.',
        // TODO: legal review
        'We do not sell your personal information.',
      ],
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
        'This website uses cookies and similar technologies that are necessary for the site to function, and — where applicable — analytics technologies that help us understand aggregate site usage. This section describes the categories in use, their purpose, and how you can control them through your browser.',
      ],
    },
    {
      id: 'sharing',
      heading: 'How We Share Information',
      needsLegalReview: true,
      body: [
        // TODO: legal review — the named processors (hosting, email delivery,
        // CRM, analytics) must be listed by the company before launch.
        'Information you submit through this website is forwarded to SafePass systems so that our team can respond to you. We also use service providers that process information on our behalf — for example hosting, email delivery, and customer-relationship tooling. These providers may only process information on our instructions.',
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
        // TODO: legal review
        'We apply technical and organisational measures intended to protect personal information against unauthorised access, loss, or misuse. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.',
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
      list: [
        'To ask what personal information we hold about you and obtain a copy of it.',
        'To ask us to correct information that is inaccurate or incomplete.',
        'To ask us to delete your information in the circumstances the law allows.',
        'To object to, or ask us to restrict, certain processing.',
        'To withdraw consent where our processing relies on your consent.',
        'To ask us to transfer your information to you or another controller in a portable format.',
        'To complain to the Nigeria Data Protection Commission.',
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
      ],
    },
  ],
  relatedLinks: [
    { href: '/terms', label: 'Terms of Service' },
    { href: '/about', label: 'About SafePass' },
    { href: '/', label: 'Back to homepage' },
  ],
};
