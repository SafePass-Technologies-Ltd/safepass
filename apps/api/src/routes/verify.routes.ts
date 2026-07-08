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

const PAGE_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background: #0f172a; color: #e2e8f0; margin: 0; min-height: 100vh;
         display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { max-width: 420px; width: 100%; background: #1e293b; border-radius: 16px;
          padding: 32px 28px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); text-align: center; }
  .logo { font-size: 20px; font-weight: 700; color: #22c55e; margin-bottom: 8px; }
  h1 { font-size: 20px; margin: 4px 0 4px; color: #f1f5f9; }
  p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 0 0 8px; }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px;
           border-radius: 999px; font-size: 13px; font-weight: 600; margin: 10px 0; }
  .badge.verified { background: rgba(34,197,94,0.15); color: #22c55e; }
  .badge.unverified { background: rgba(234,179,8,0.15); color: #eab308; }
  .badge.live { background: rgba(239,68,68,0.15); color: #ef4444; }
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
    'Vehicle Verification',
    `<div class="error-icon">⚠️</div><h1>${message}</h1><p>This QR code may be invalid or the vehicle is no longer registered with SafePass.</p>`
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
      ${vehicle.isVerified ? '✓ Verified vehicle' : '⚠ Not yet verified'}
    </span>
    <br />
    <span class="badge ${liveTrip ? 'live' : ''}" style="${liveTrip ? '' : 'background:rgba(148,163,184,0.15);color:#94a3b8;'}">
      ${liveTrip ? '● Currently on a monitored trip' : '○ Not currently on a monitored trip'}
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
