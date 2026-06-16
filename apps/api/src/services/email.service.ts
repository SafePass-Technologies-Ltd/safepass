/**
 * Email Service — transactional notifications via Resend.
 *
 * Sending is best-effort: a missing RESEND_API_KEY or a delivery failure is
 * logged and swallowed, never thrown, since no email flow in this app should
 * be able to block the underlying action (e.g. a role upgrade approval).
 */
import { Resend } from 'resend';
import { env } from '../env';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping email to ${to}: "${subject}"`);
    return;
  }

  try {
    await resend.emails.send({ from: env.EMAIL_FROM, to, subject, html });
  } catch (err) {
    console.error(`[email] Failed to send "${subject}" to ${to}:`, err);
  }
}

export async function sendRoleUpgradeApprovedEmail(params: {
  to: string;
  fullName: string;
  requestedRole: string;
  organizationName?: string | null;
}): Promise<void> {
  const { to, fullName, requestedRole, organizationName } = params;
  const orgLine = organizationName
    ? `<p>Your organization, <strong>${organizationName}</strong>, has been verified and your account has been upgraded to <strong>${requestedRole}</strong>.</p>`
    : `<p>Your account has been upgraded to <strong>${requestedRole}</strong>.</p>`;

  await sendEmail(
    to,
    'Your SafePass access request has been approved',
    `<p>Hi ${fullName},</p>${orgLine}<p>You can now sign in and access the dashboard for your new role.</p><p>— The SafePass Team</p>`
  );
}

export async function sendRoleUpgradeRejectedEmail(params: {
  to: string;
  fullName: string;
  requestedRole: string;
  organizationName?: string | null;
  reason?: string | null;
}): Promise<void> {
  const { to, fullName, requestedRole, organizationName, reason } = params;
  const orgLine = organizationName
    ? `<p>Your request to register <strong>${organizationName}</strong> for <strong>${requestedRole}</strong> access was not approved.</p>`
    : `<p>Your request for <strong>${requestedRole}</strong> access was not approved.</p>`;
  const reasonLine = reason ? `<p><strong>Reason:</strong> ${reason}</p>` : '';

  await sendEmail(
    to,
    'Update on your SafePass access request',
    `<p>Hi ${fullName},</p>${orgLine}${reasonLine}<p>If you believe this was a mistake, please contact support.</p><p>— The SafePass Team</p>`
  );
}
