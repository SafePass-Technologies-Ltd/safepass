/**
 * Join Landing Routes — human-facing web page for org invite deep links.
 *
 * GET /join/:token — mounted at the site root (not under /v1), so it
 * matches APP_DEEP_LINK_BASE_URL exactly (see env.ts: default
 * "https://api.safepass-tech.com/join", appended with /<token> by
 * apps/api/src/services/org-membership.service.ts's buildInviteLink()).
 *
 * There is no custom URL scheme / universal link association configured
 * for the mobile app yet (no CFBundleURLSchemes / Android intent-filter),
 * so this can't silently hand off to an already-installed app. Instead it
 * shows a plain landing page confirming the invite is real (org name/type)
 * and the exact steps to join manually in-app, per user_flow.md's
 * documented flow: "Open app → Profile → Join an Organisation → enter
 * token". It still attempts a `safepass://` custom-scheme redirect
 * up front (harmless no-op today if unregistered; starts working for
 * free the moment that scheme is added to the app, no change needed here).
 *
 * Deliberately public (no authMiddleware) — this page must be viewable by
 * someone who doesn't have the app yet and isn't signed in at all.
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { inviteTokens, organizations } from '../db/schema';

export const joinRoutes = new Hono();

const PAGE_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background: #0f172a; color: #e2e8f0; margin: 0; min-height: 100vh;
         display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { max-width: 420px; width: 100%; background: #1e293b; border-radius: 16px;
          padding: 32px 28px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); text-align: center; }
  .logo { font-size: 20px; font-weight: 700; color: #22c55e; margin-bottom: 8px; }
  h1 { font-size: 18px; margin: 0 0 8px; color: #f1f5f9; }
  p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 0 0 16px; }
  .org-name { color: #f1f5f9; font-weight: 600; }
  .token-box { background: #0f172a; border: 1px solid #334155; border-radius: 10px;
               padding: 14px; margin: 16px 0; font-family: ui-monospace, monospace;
               font-size: 18px; letter-spacing: 2px; color: #22c55e; word-break: break-all;
               cursor: pointer; }
  .steps { text-align: left; font-size: 13px; color: #cbd5e1; margin: 16px 0; padding-left: 20px; }
  .steps li { margin-bottom: 6px; }
  .error-icon { font-size: 32px; margin-bottom: 8px; }
`;

function renderPage(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — SafePass</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <div class="card">
    <div class="logo">🛡️ SafePass</div>
    ${bodyHtml}
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return renderPage(
    'Invite',
    `<div class="error-icon">⚠️</div><h1>${message}</h1><p>Ask whoever shared this link for a new one.</p>`
  );
}

joinRoutes.get('/:token', async (c) => {
  const token = c.req.param('token');

  const invite = await db.query.inviteTokens.findFirst({
    where: eq(inviteTokens.token, token),
  });

  if (!invite || invite.status !== 'active') {
    return c.html(errorPage('Invalid or already-used invite link'), 404);
  }

  if (new Date(invite.expiresAt) < new Date()) {
    return c.html(errorPage('This invite link has expired'), 410);
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, invite.organizationId),
  });

  if (!org) {
    return c.html(errorPage('Organisation not found'), 404);
  }

  const html = renderPage(
    'Join organisation',
    `
    <h1>You've been invited to join</h1>
    <p class="org-name">${escapeHtml(org.name)}</p>
    <p>Open the SafePass app and enter this invite code to join:</p>
    <div class="token-box" onclick="navigator.clipboard?.writeText('${token}')" title="Tap to copy">${token}</div>
    <ol class="steps">
      <li>Download the SafePass app (if you haven't already)</li>
      <li>Sign in or create an account</li>
      <li>Go to Profile → "Join an Organisation"</li>
      <li>Enter the code above</li>
    </ol>
    <p>Don't have the app yet? Ask your organisation admin how to get it.</p>
    `
  );

  // Best-effort attempt to hand off to the app via a custom URL scheme --
  // a no-op today (no such scheme is registered on either platform yet),
  // but free to start working the moment one is added, no server change
  // needed. Fired client-side, not as an HTTP redirect, so the fallback
  // page above still renders immediately regardless of whether it works.
  const htmlWithSchemeAttempt = html.replace(
    '</body>',
    `<script>try { window.location.href = 'safepass://join/${token}'; } catch (e) {}</script></body>`
  );

  return c.html(htmlWithSchemeAttempt);
});

/** Minimal HTML-escaping for org names rendered into the page (defense in
 * depth -- org names are admin/self-service-entered strings, not free-form
 * public input, but this costs nothing and closes the XSS door regardless). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
