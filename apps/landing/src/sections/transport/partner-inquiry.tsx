import { Container, Section } from '@/components/ui/container';
import { PartnerInquiryForm } from '@/components/forms/partner-inquiry-form';

/**
 * Partner Inquiry section — the terminal section of the Transport Partner
 * Audience Page (`screens/04`), FEAT-012.
 *
 * Section wrapper only: the form, its states, and its delivery live in
 * `components/forms/`. The rest of the Transport Partner page (FEAT-011) is a
 * separate slice and is not built here.
 *
 * `id="inquiry"` is load-bearing — screens/04 requires the form be
 * deep-linkable at `/transport-partners#inquiry`, since sales outreach links
 * point straight at it.
 */
export function PartnerInquirySection({ sourcePage = '/transport-partners' }: { sourcePage?: string }) {
  return (
    <Section id="inquiry" className="bg-surface-secondary">
      <Container className="grid items-start gap-2xl md:grid-cols-2">
        <div className="flex flex-col gap-md">
          <p className="text-caption uppercase tracking-wide text-accent-text">Partner with us</p>
          <h2 className="text-h2 text-text-primary">Talk to us about your fleet</h2>
          <p className="text-body-large text-text-secondary">
            Tell us roughly how many vehicles you run and how to reach you, and we&apos;ll come back
            to you about onboarding, costs, and what monitored journeys would mean for your
            passengers.
          </p>
          <p className="text-body text-text-secondary">
            A real person replies — this doesn&apos;t route you into a consumer signup flow.
          </p>
        </div>

        <PartnerInquiryForm sourcePage={sourcePage} />
      </Container>
    </Section>
  );
}
