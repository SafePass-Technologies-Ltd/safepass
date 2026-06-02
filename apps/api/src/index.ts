import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { errorHandler } from './middleware/error';
import { authRoutes } from './routes/auth.routes';
import { userRoutes } from './routes/users.routes';
import { env } from './env';

const app = new Hono();

// =============================================================================
// Global Middleware
// =============================================================================

// CORS — allow all origins in development
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

// Structured logging (pino-compatible in production)
if (env.NODE_ENV === 'development') {
  app.use('*', logger());
}

// =============================================================================
// Error Handling
// =============================================================================
app.onError(errorHandler);

// =============================================================================
// Health Check
// =============================================================================
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// =============================================================================
// API Routes (v1)
// =============================================================================

const v1 = new Hono();
v1.route('/auth', authRoutes);
v1.route('/users', userRoutes);

app.route('/v1', v1);

// =============================================================================
// 404 Handler
// =============================================================================
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
