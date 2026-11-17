import { clientEnv } from '@/lib/env';
import type { LegalDocument } from './types';

/**
 * App Privacy Policy — the disclosure that covers the SafePass mobile app
 * (Android + iOS), as distinct from the website policy in `privacy-policy.ts`.
 *
 * WHY THIS PAGE EXISTS: Google Play requires the privacy policy URL submitted
 * with an app to describe what *that app* collects. The website policy states
 * in its own intro that it does not cover trip monitoring or location
 * tracking, so submitting it as the Play listing's policy URL would be a
 * mismatch between the declaration and the published document.
 *
 * ============================ READ BEFORE EDITING ============================
 * TODO: legal review — the section STRUCTURE and the statements about what the
 * app technically does (background location during a monitored trip, silent
 * audio capture on panic, wallet transactions) are derived from the
 * implementation and are factual. The regulatory framing around them is
 * PLACEHOLDER PROSE: concrete retention periods, the named lawful basis per
 * purpose, processor identities, and the transfer mechanism must be supplied by
 * Nigerian-qualified counsel. Inventing any of those would be fabricating a
 * regulatory claim.
 *
 * risk_log.md R-011 and the NDPA/GAID 2025 tracking-software requirements both
 * apply here directly: this is the document that describes tracking software.
 * =============================================================================
 */
export const appPrivacyPolicy: LegalDocument = {
  title: 'App Privacy Policy',
  description:
    'What the SafePass mobile app collects — including live location and emergency audio — why it is collected, who it is shared with, and the rights you have over it.',
  lastUpdated: '2026-11-17',
  showTableOfContents: true,
  intro: [
    // TODO: legal review
    'This policy covers the SafePass mobile app for Android and iOS. It explains what the app collects while you use it, why, and what control you have over it.',
    'SafePass monitors journeys. To do that, the app shares your location with the SafePass officer watching your trip, and the panic button can capture audio as evidence. Both are described in full below, and both are switched on by your own action — nothing here happens silently in the background while you are not on a monitored trip.',
    'Information you submit through our website is covered separately by the website Privacy Policy.',
  ],
  sections: [
    {
      id: 'who-we-are',
      heading: 'Who We Are',
      needsLegalReview: true,
      body: [
        // Entity name and controller framing are client-supplied. RC number and
        // registered office are NOT supplied — they must come from the company.
        'SafePass Technologies Ltd operates the SafePass app and acts as the data controller for the information described in this policy. Our registered company details are set out below.',
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
      heading: 'What the App Collects',
      needsLegalReview: true,
      body: [
        'The app collects the following categories of information. Each is tied to a specific part of the service rather than gathered for its own sake.',
      ],
      listGroups: [
        {
          heading: 'Account and profile',
          items: [
            'Your name, phone number, email address, and profile photo where you provide one.',
            'The sign-in method you use (phone number, Google, or Apple) and the identifier that method returns.',
            'Your emergency contacts, if you add them, including their names and phone numbers.',
          ],
        },
        {
          heading: 'Journey and location',
          items: [
            'Precise device location while a journey is being monitored, including while the app is in the background or your screen is off.',
            'Journey details you enter: origin, destination, vehicle, and scheduled departure time.',
            'Check-in and safe-arrival confirmations, and your position along the route.',
          ],
        },
        {
          heading: 'Safety content you create',
          items: [
            'Incident reports you submit, including any description and photo you attach.',
            'Messages you exchange with the SafePass officer monitoring your journey.',
            'Vehicle documents you upload, where your organisation or transport partner requires them.',
          ],
        },
        {
          heading: 'Emergency audio',
          items: [
            'Audio recorded by the app after you press the panic button, captured without an on-screen prompt for your safety in an emergency.',
          ],
        },
        {
          heading: 'Payments and wallet',
          items: [
            'Wallet balance, top-up amounts, and per-trip charges.',
            'Transaction references returned by our payment providers. We do not receive or store your full card number.',
          ],
        },
        {
          heading: 'Device and diagnostics',
          items: [
            'A push-notification token so the app can alert you about your journey.',
            'Basic device and app-version information used to keep the app working across Android versions.',
          ],
        },
      ],
    },
    {
      id: 'location-data',
      heading: 'Location, Including Background Location',
      needsLegalReview: true,
      body: [
        'Location is the core of the service: a journey can only be watched if the officer can see where you are. The app asks for location access when you register your first journey, and asks separately for background location access so monitoring continues when your screen is off or you switch apps mid-trip.',
        'Background location is used only while a monitored journey is active. When the journey ends — you confirm safe arrival, or monitoring is stopped — the app stops reporting your position and the foreground service that carries it shuts down. The app does not track you between journeys.',
        // TODO: legal review — retention period for location history.
        'Your route is retained as part of your journey history so you and your organisation can review past trips. The retention period that applies is set out in this section.',
      ],
    },
    {
      id: 'emergency-audio',
      heading: 'Emergency Audio Recording',
      needsLegalReview: true,
      body: [
        'When you press the panic button during a monitored journey, the app begins recording audio from your device microphone and uploads it to SafePass as evidence. The recording is intentionally not announced on screen at that moment: showing a recording indicator could escalate a situation where you are already unsafe.',
        'Because of that, the app asks for your explicit consent to emergency audio recording before you can complete profile setup, and states it again on the sign-in screen. If you do not accept it, you can still use the app, but the panic button will not capture audio.',
        'Recordings are available to the SafePass officers handling the emergency and to the people responsible for investigating the incident. They are not used for any other purpose.',
        // TODO: legal review — retention period for emergency recordings.
        'The period for which recordings are kept, and the point at which they are deleted, is set out in this section.',
      ],
    },
    {
      id: 'how-we-use-information',
      heading: 'How We Use Your Information',
      needsLegalReview: true,
      body: [
        'We use the information above to monitor your journey, alert you to risk on your route, respond when you raise a panic alert, and settle the fee for each monitored trip. Journey history and incident reports are also used to improve the safety map other travellers rely on.',
        'We use device and diagnostic information to deliver notifications and to keep the app working. We do not use your information for advertising.',
      ],
      emphasis: ['We do not sell your personal information.'],
    },
    {
      id: 'lawful-basis',
      heading: 'Lawful Basis for Processing',
      needsLegalReview: true,
      body: [
        // TODO: legal review — the specific basis per purpose under the Nigeria
        // Data Protection Act must be stated by counsel, not assumed here.
        'We process personal information on the lawful bases permitted under Nigerian data protection law. Location tracking and emergency audio capture in particular rely on bases that must be stated precisely; the specific basis for each purpose is set out in this section.',
      ],
    },
    {
      id: 'sharing',
      heading: 'Who We Share It With',
      needsLegalReview: true,
      body: [
        'SafePass officers and administrators see the information needed to monitor and respond: your journey, your position, your messages, and any alert you raise.',
        // TODO: legal review — processors must be named by the company before launch.
        'We use service providers that process information on our behalf — cloud hosting and storage, authentication, push notifications, mapping, and payment processing. These providers may only process information on our instructions.',
        'We never sell or rent personal information to advertisers or data brokers.',
        // TODO: legal review
        'We may disclose information where the law requires it, or where it is necessary to protect someone from serious harm during an emergency.',
      ],
    },
    {
      id: 'retention',
      heading: 'How Long We Keep Information',
      needsLegalReview: true,
      body: [
        // TODO: legal review — DO NOT state a specific retention period here.
        'We keep personal information only as long as needed for the purposes in this policy, or as long as the law requires. The retention period for each category — location history, messages, incident reports, and emergency recordings — is set out in this section.',
      ],
    },
    {
      id: 'security',
      heading: 'How We Protect Information',
      needsLegalReview: true,
      body: [
        'We protect information using encryption in transit, access controls, authentication, and logging, and we limit access to journey and emergency data to the officers and administrators who need it.',
        // TODO: legal review
        'No system can guarantee absolute security, but we work to keep the information we hold secure and to respond promptly if a risk is identified.',
      ],
    },
    {
      id: 'international-transfers',
      heading: 'International Transfers',
      needsLegalReview: true,
      body: [
        // TODO: legal review — the transfer mechanism must be named by counsel.
        'Some of our service providers may process information outside Nigeria. Where that happens, we rely on a transfer mechanism permitted under Nigerian data protection law, described in this section.',
      ],
    },
    {
      id: 'your-rights',
      heading: 'Your Rights',
      needsLegalReview: true,
      body: [
        'Subject to Nigerian data protection law, you have rights over the personal information we hold about you.',
      ],
      listStyle: 'check',
      list: [
        'Access: ask what personal information we hold about you and obtain a copy of it.',
        'Correction: ask us to correct information that is inaccurate or incomplete.',
        'Deletion: ask us to delete your information in the circumstances the law allows.',
        'Restriction: object to, or ask us to restrict, certain processing.',
        'Withdrawal: withdraw consent where our processing relies on your consent — including emergency audio recording.',
        'Portability: ask us to transfer your information to you or another controller in a portable format.',
        'Complaint: complain to the Nigeria Data Protection Commission.',
      ],
    },
    {
      id: 'deleting-your-account',
      heading: 'Deleting Your Account',
      body: [
        'You can delete your account from inside the app, under Profile → Delete account. Deleting your account removes your profile, your emergency contacts, and your saved vehicles.',
        // TODO: legal review — the carve-out for records the company must keep
        // (payment records, incident evidence) needs counsel's wording.
        'Some records are kept after account deletion where the law requires it, or where they form part of an incident investigation. The categories that survive deletion, and for how long, are set out in this section.',
        `If you cannot sign in to delete your account, contact us at ${clientEnv.fallbackContactEmail} and we will action the request.`,
      ],
    },
    {
      id: 'childrens-privacy',
      heading: "Children's Privacy",
      needsLegalReview: true,
      body: [
        // TODO: legal review — confirm the minimum age to state.
        'The app is intended for adults and is not directed at children. We do not knowingly collect personal information from children through it.',
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to This Policy',
      needsLegalReview: true,
      body: [
        'We may update this policy as the app changes. The date at the top of this page shows when it was last updated, and material changes that affect what the app collects will be highlighted here.',
      ],
    },
    {
      id: 'contact',
      heading: 'Contact Us',
      body: [
        `If you have a question about this policy, or want to exercise any of the rights above, contact us at ${clientEnv.fallbackContactEmail}.`,
        'We aim to respond to privacy enquiries within 30 days.',
      ],
    },
    {
      id: 'privacy-commitment',
      heading: 'Our Privacy Commitment',
      body: [
        'SafePass exists to improve personal safety, not to exploit personal information. The app collects location and audio because monitoring and emergency evidence are the service you paid for — not as a by-product to be traded. We never sell personal information, and we design our systems to minimise what we collect wherever it is practical to do so.',
      ],
    },
  ],
  relatedLinks: [
    { href: '/privacy', label: 'Website Privacy Policy' },
    { href: '/terms', label: 'Terms of Service' },
    { href: '/about', label: 'About SafePass' },
    { href: '/', label: 'Back to homepage' },
  ],
};
