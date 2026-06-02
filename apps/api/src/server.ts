import { serve } from '@hono/node-server';
import { app } from './index';
import { env } from './env';

console.log(`🚀 SafePass API starting...`);
console.log(`   Environment: ${env.NODE_ENV}`);
console.log(`   Port: ${env.PORT}`);

serve({
  fetch: app.fetch,
  port: env.PORT,
});

console.log(`✅ SafePass API listening on http://localhost:${env.PORT}`);
