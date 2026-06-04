import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { errorHandler } from './middleware/error';
import { authRoutes } from './routes/auth.routes';
import { userRoutes } from './routes/users.routes';
import { tripRoutes, adminTripRoutes } from './routes/trip.routes';
import { walletRoutes, adminWalletRoutes } from './routes/wallet.routes';
import { paymentRoutes } from './routes/payment.routes';
import { messageRoutes } from './routes/message.routes';
import { env } from './env';

const app = new Hono();

// Global Middleware
app.use(
  '*',
  cors({
    origin: env.NODE_ENV === 'production' ? [env.ADMIN_DASHBOARD_URL] : '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
  })
);

if (env.NODE_ENV === 'development') {
  app.use('*', logger());
}

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

// Trip lifecycle + GPS updates
v1.route('/trips', tripRoutes);

// Wallet balance + transactions
v1.route('/wallets', walletRoutes);

// Payment gateway (top-up, verify, webhook)
v1.route('/payments', paymentRoutes);

// Messaging (scoped to trips)
v1.route('/', messageRoutes);

// ──────────────────────────────────────────────────────────
// Admin Routes (v1/admin)
// ──────────────────────────────────────────────────────────

const adminV1 = new Hono();
adminV1.route('/trips', adminTripRoutes);
adminV1.route('/wallets', adminWalletRoutes);
// Future: adminV1.route('/users', adminUserRoutes);
// Future: adminV1.route('/incidents', adminIncidentRoutes);

v1.route('/admin', adminV1);

// ──────────────────────────────────────────────────────────

app.route('/v1', v1);

// 404 Handler
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: 404,
        message: `Route not found: ${c.req.method} ${c.req.path}`,
      },
    },
    404
  );
});

export { app };
