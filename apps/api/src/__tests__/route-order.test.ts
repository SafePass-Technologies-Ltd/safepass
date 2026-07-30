import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the registration order of the public routes inside the `v1` sub-app.
 *
 * `messageRoutes` is mounted at v1's ROOT (`v1.route('/', messageRoutes)`) and
 * declares `use('*', authMiddleware)`. In Hono that wildcard applies to every
 * route registered AFTER it, so anything mounted below that line silently
 * inherits user authentication.
 *
 * That is not theoretical: `/v1/leads` was originally registered further down
 * and answered "Missing or invalid Authorization header" instead of running
 * its own service-key check, which made lead capture impossible for the
 * marketing site. It looked correct in review -- the route file has its own
 * middleware -- and only showed up when the deployed endpoint was actually
 * called.
 *
 * This is a source-order assertion rather than a request test because that is
 * exactly the property that broke: the handler was fine, its POSITION was not.
 * A request-level test would need the whole app booted with a database.
 */

const indexSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../index.ts'),
  'utf-8'
);

/** Line number of a registration, ignoring comments that mention the same text. */
function registrationLine(snippet: string): number {
  const lines = indexSource.split('\n');
  const index = lines.findIndex(
    (line) => line.includes(snippet) && !line.trim().startsWith('//') && !line.trim().startsWith('*')
  );
  if (index === -1) throw new Error(`No registration found for: ${snippet}`);
  return index;
}

describe('v1 route registration order', () => {
  const authWildcard = () => registrationLine("v1.route('/', messageRoutes)");

  it.each([
    ["v1.route('/auth', authRoutes)", 'login'],
    ["v1.route('/leads', leadRoutes)", 'marketing lead intake'],
  ])('%s stays above the auth wildcard (%s must be publicly reachable)', (snippet) => {
    expect(registrationLine(snippet)).toBeLessThan(authWildcard());
  });

  it('still mounts messageRoutes at the root, which is what makes order matter', () => {
    // If this ever stops being a root mount, the constraint above is moot and
    // these tests should be revisited rather than left as cargo cult.
    expect(indexSource).toContain("v1.route('/', messageRoutes)");
  });
});
