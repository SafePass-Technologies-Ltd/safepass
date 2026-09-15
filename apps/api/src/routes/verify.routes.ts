/**
 * Vehicle Verification Routes — public, unauthenticated QR lookup.
 *
 * GET /verify/v/:token — mounted at the site root (not under /v1), so it
 * matches VEHICLE_VERIFY_BASE_URL exactly (env.ts default:
 * "https://api.safepass-tech.com/verify/v", appended with /<token> by
 * apps/api/src/services/vehicle.service.ts's generateVehicleQr()).
 *
 * Per architecture.md's Vehicle Verification Service: "Public
 * (unauthenticated) endpoint for QR-based vehicle lookup. Returns only:
 * registration status, verification status, company name, live trip
 * boolean. Never exposes driver, passenger, or location data. Rate-limited
 * to prevent enumeration." The global rate limiter (index.ts, 100 req/min
 * per IP) already covers the enumeration-prevention requirement -- no
 * separate limiter needed here.
 */
import { Hono } from 'hono';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db';
import { transportVehicles, organizations, trips } from '../db/schema';

export const verifyRoutes = new Hono();

// Tokenized light-column palette from docs/SafePass/branding.md:
//   primary #0EA5E9 · success #0D904F · warning #F5A623 · error #D93025
//   ink/text #1E293B · background #F8FAFC · border #E2E8F0
// Tints are rgba() derivations of the same tokens (never new hues).
const PAGE_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background: #F8FAFC; color: #1E293B; margin: 0; min-height: 100vh;
         display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { max-width: 420px; width: 100%; background: #FFFFFF; border: 1px solid #E2E8F0;
          border-radius: 16px; padding: 32px 28px; box-shadow: 0 10px 40px rgba(15,23,42,0.08); text-align: center; }
  .logo { display: inline-flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 700;
          color: #0EA5E9; margin-bottom: 8px; }
  h1 { font-size: 20px; margin: 4px 0 4px; color: #1E293B; }
  p { font-size: 14px; line-height: 1.6; color: rgba(30,41,59,0.75); margin: 0 0 8px; }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px;
           border-radius: 999px; font-size: 13px; font-weight: 600; margin: 10px 0; }
  .badge.verified { background: rgba(13,144,79,0.12); color: #0D904F; }
  .badge.unverified { background: rgba(245,166,35,0.14); color: #F5A623; }
  .badge.live { background: rgba(217,48,37,0.10); color: #D93025; }
  .badge.idle { background: rgba(30,41,59,0.08); color: #1E293B; }
  .error-icon { margin-bottom: 8px; }
`;

// Tiny dependency-free inline SVG markers replacing the previous emoji
// glyphs (shield, warning triangle, filled/outlined status dots). Colours are
// branding tokens, and every badge keeps a text label alongside the shape per
// branding.md's color-independence rule.
const SHIELD_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2 4 5v6c0 5.25 3.4 10.15 8 11 4.6-.85 8-5.75 8-11V5l-8-3Z" fill="#0EA5E9"/><path d="m9 11.5 2 2 4-4.5" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
const WARNING_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z" fill="#F5A623"/><path d="M12 9v4.5" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.4" r="1.2" fill="#FFFFFF"/></svg>`;
const ERROR_ICON = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="rgba(217,48,37,0.10)"/><path d="M12 7v6" stroke="#D93025" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1.2" fill="#D93025"/></svg>`;
const LIVE_DOT = `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="#D93025"/></svg>`;
const IDLE_DOT = `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="3.5" fill="none" stroke="#1E293B" stroke-width="1.5"/></svg>`;

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
    <div class="logo">${SHIELD_ICON}<span>SafePass</span></div>
    ${bodyHtml}
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return renderPage(
    'Vehicle Verification',
    `<div class="error-icon">${ERROR_ICON}</div><h1>${message}</h1><p>This QR code may be invalid or the vehicle is no longer registered with SafePass.</p>`
  );
}

const ACTIVE_TRIP_STATUSES = ['active', 'delayed', 'emergency', 'escalated'] as const;

verifyRoutes.get('/:token', async (c) => {
  const token = c.req.param('token');

  const vehicle = await db.query.transportVehicles.findFirst({
    where: and(eq(transportVehicles.qrVerificationToken, token), eq(transportVehicles.isActive, true)),
  });

  if (!vehicle) {
    return c.html(errorPage('Vehicle not found'), 404);
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, vehicle.organizationId),
  });

  // Never expose driver/passenger/location data here -- only whether SOME
  // trip on this exact plate number is currently in an active-ish state.
  const liveTrip = vehicle.plateNumber
    ? await db.query.trips.findFirst({
        where: and(
          eq(trips.vehiclePlateNumber, vehicle.plateNumber),
          inArray(trips.status, ACTIVE_TRIP_STATUSES)
        ),
      })
    : null;

  const html = renderPage(
    'Vehicle Verification',
    `
    <h1>${escapeHtml(vehicle.plateNumber)}</h1>
    <p>${escapeHtml(org?.name ?? 'Unknown operator')}</p>
    <span class="badge ${vehicle.isVerified ? 'verified' : 'unverified'}">
      ${vehicle.isVerified ? '✓ Verified vehicle' : `${WARNING_ICON} Not yet verified`}
    </span>
    <br />
    <span class="badge ${liveTrip ? 'live' : 'idle'}">
      ${liveTrip ? `${LIVE_DOT} Currently on a monitored trip` : `${IDLE_DOT} Not currently on a monitored trip`}
    </span>
    <p style="margin-top: 20px;">This vehicle is registered on SafePass. If you feel unsafe, contact local authorities immediately.</p>
    `
  );

  return c.html(html);
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
