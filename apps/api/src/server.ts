/**
 * SafePass API Server — HTTP + WebSocket entry point.
 *
 * Uses @hono/node-server serve() for the HTTP server and attaches
 * a WebSocket server on the same port for real-time communication.
 */
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import { app } from './index';
import { env } from './env';
import { attachWebSocketServer } from './services/websocket.service';
import { initDynamoTable } from './services/dynamo.service';
import { startBreadcrumbFlushing } from './services/trip-archive.service';
import { startScheduledJobs } from './jobs/scheduler';

console.log(`🚀 SafePass API starting...`);
console.log(`   Environment: ${env.NODE_ENV}`);
console.log(`   Port: ${env.PORT}`);

// serve() creates an http.Server, starts listening, and returns the server instance.
const httpServer = serve(
  { fetch: app.fetch, port: env.PORT },
  () => {
    console.log(`✅ SafePass API (REST + WebSocket) listening on http://localhost:${env.PORT}`);
  }
);

// Attach WebSocket server to the same HTTP server for real-time communication.
attachWebSocketServer(httpServer as Server);

// Initialise DynamoDB table for GPS location storage (non-fatal — API boots
// regardless so a missing DynamoDB doesn't block REST endpoints).
initDynamoTable().catch((err: Error) => {
  console.warn(
    '[DynamoDB] Table init failed (may be unavailable in this environment):',
    err.message
  );
});

// A-26 Tier 3: start the periodic breadcrumb batch flush (trip_location_history).
startBreadcrumbFlushing();

// M-38: start the hourly account-deletion sweep job (see jobs/scheduler.ts).
startScheduledJobs();
