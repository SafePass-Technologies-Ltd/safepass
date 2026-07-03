import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { rateLimiter } from 'hono-rate-limiter';
import { errorHandler } from './middleware/error';
import { authRoutes } from './routes/auth.routes';
import { userRoutes } from './routes/users.routes';
import { tripRoutes, adminTripRoutes } from './routes/trip.routes';
import { walletRoutes, adminWalletRoutes } from './routes/wallet.routes';
import { paymentRoutes } from './routes/payment.routes';
import { messageRoutes } from './routes/message.routes';
import { incidentRoutes, adminIncidentRoutes } from './routes/incident.routes';
import { markerRoutes, adminMarkerRoutes } from './routes/map-marker.routes';
import { orgRoutes, adminOrgRoutes } from './routes/organization.routes';
import { emergencyRoutes, escalationRoutes, checkinRoutes, adminMessageRoutes } from './routes/admin-emergency.routes';
import { emergencyTriggerRoutes } from './routes/emergency.routes';
import { adminUserRoutes } from './routes/admin-user.routes';
import { roleUpgradeRoutes } from './routes/role-upgrade.routes';
import { orgMembershipRoutes } from './routes/org-membership.routes';
import { geocodingRoutes } from './routes/geocoding.routes';
import { vehicleRoutes } from './routes/vehicle.routes';
import { driverRoutes } from './routes/driver.routes';
import { documentRoutes } from './routes/document.routes';
import { scheduledTripRoutes } from './routes/scheduled-trip.routes';
import { orgSubscriptionRoutes, adminSubscriptionRoutes } from './routes/subscription.routes';
import { env } from './env';

const app = new Hono();

// Global Middleware
app.use(
  '*',
  cors({
    // All three dashboard apps (admin/corporate/transport) are separate
    // Next.js deployments with distinct origins -- previously only
    // ADMIN_DASHBOARD_URL was allowed, which silently CORS-blocked the
    // other two dashboards in production.
    origin:
      env.NODE_ENV === 'production'
        ? [env.ADMIN_DASHBOARD_URL, env.CORPORATE_DASHBOARD_URL, env.TRANSPORT_DASHBOARD_URL]
        : '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
  })
);

if (env.NODE_ENV === 'development') {
  app.use('*', logger());
}

// Rate limiting — keyed by IP address from standard proxy headers or socket.
const ipKey = (c: Parameters<Parameters<typeof rateLimiter>[0]['keyGenerator']>[0]): string =>
  c.req.header('x-forwarded-for')?.split(',')[0].trim() ??
  c.req.header('x-real-ip') ??
  (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress ??
  'unknown';

// Global: 100 req/min per IP
app.use(
  '*',
  rateLimiter({
    windowMs: 60_000,
    limit: 100,
    keyGenerator: ipKey,
    message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, please try again later.' } },
  })
);

// Auth routes: 10 req/min per IP (brute-force protection)
app.use(
  '/v1/auth/*',
  rateLimiter({
    windowMs: 60_000,
    limit: 10,
    keyGenerator: ipKey,
    message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many authentication attempts, please try again later.' } },
  })
);

// Error Handling
app.onError(errorHandler);

// Health Check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// ──────────────────────────────────────────────────────────
// API Routes (v1)
// ──────────────────────────────────────────────────────────

const v1 = new Hono();

// Auth (unauthenticated)
v1.route('/auth', authRoutes);

// User profiles + vehicles
v1.route('/users', userRoutes);

// Scheduled / calendar trips — must be registered BEFORE tripRoutes
// to prevent GET /trips/:id from swallowing the /trips/scheduled path.
v1.route('/trips', scheduledTripRoutes);

// Trip lifecycle + GPS updates
v1.route('/trips', tripRoutes);

// Wallet balance + transactions
v1.route('/wallets', walletRoutes);

// Payment gateway (top-up, verify, webhook)
v1.route('/payments', paymentRoutes);

// Messaging (scoped to trips)
v1.route('/', messageRoutes);

// Incident reporting + proximity lookup
v1.route('/incidents', incidentRoutes);

// Map marker interactions (user-facing)
v1.route('/markers', markerRoutes);

// Organization management (corporate + transport partner)
v1.route('/organizations', orgRoutes);

// Org membership: slots, invite tokens, join/leave
v1.route('/org', orgMembershipRoutes);

// Org subscription plan requests (C-20, T-20)
v1.route('/org/subscription', orgSubscriptionRoutes);

// Geocoding: reverse (GPS → address) + autocomplete + place resolve
v1.route('/geocoding', geocodingRoutes);

// Transport partner fleet management
v1.route('/vehicles', vehicleRoutes);
v1.route('/drivers', driverRoutes);

// Compliance documents (transport dashboard)
v1.route('/documents', documentRoutes);

// Emergency trigger (user-facing panic button)
v1.route('/emergency', emergencyTriggerRoutes);

// ──────────────────────────────────────────────────────────
// Admin Routes (v1/admin) 
// ──────────────────────────────────────────────────────────

const adminV1 = new Hono();
adminV1.route('/trips', adminTripRoutes);
adminV1.route('/wallets', adminWalletRoutes);
adminV1.route('/users', adminUserRoutes);
adminV1.route('/incidents', adminIncidentRoutes);
adminV1.route('/markers', adminMarkerRoutes);
adminV1.route('/organizations', adminOrgRoutes);
adminV1.route('/emergencies', emergencyRoutes);
adminV1.route('/escalations', escalationRoutes);
adminV1.route('/checkins', checkinRoutes);
adminV1.route('/messages', adminMessageRoutes);
adminV1.route('/role-upgrades', roleUpgradeRoutes);
adminV1.route('/subscriptions', adminSubscriptionRoutes);

v1.route('/admin', adminV1);

// ──────────────────────────────────────────────────────────

app.route('/v1', v1);

// 404 Handler
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    },
    404
  );
});

export { app };
