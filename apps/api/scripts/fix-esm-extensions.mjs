#!/usr/bin/env node
/**
 * Postbuild step: rewrite extensionless relative import/export specifiers in
 * the compiled `dist/**\/*.js` output to include an explicit `.js` extension
 * (or `/index.js` for directory imports).
 *
 * WHY THIS EXISTS: apps/api's tsconfig.json uses
 * `"module": "ESNext"` / `"moduleResolution": "bundler"`, which lets
 * TypeScript source freely write extensionless relative imports like
 * `from './index'`. That's fine for the type-checker, and fine for `tsx`
 * (dev) which resolves extensions itself -- but `tsc` does NOT rewrite or
 * add extensions when it transpiles .ts to .js, and this app ships as
 * plain Node.js ESM (`"type": "module"` in package.json, started via
 * `node dist/server.js`). Node's native ESM resolver requires fully
 * specified relative specifiers -- it does not guess `.js` or
 * `/index.js` the way CommonJS `require()` or a bundler would. Without
 * this fix, every relative import in the compiled output fails at
 * startup with ERR_MODULE_NOT_FOUND (e.g. `from './index'` in
 * dist/server.js cannot resolve to dist/index.js).
 *
 * This script runs after `tsc` (see package.json's `build` script) and
 * rewrites only relative specifiers (starting with `./` or `../`) in
 * import/export statements and dynamic `import()` calls. Package imports
 * (`hono`, `@safepass/shared`, `node:*`, etc.) are left untouched -- Node
 * resolves those via node_modules package exports, which already work.
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '../dist');

// Matches static `import ... from '...'`, `export ... from '...'`, and
// dynamic `import('...')` specifiers -- capturing the quoted path so it can
// be rewritten in place.
const SPECIFIER_RE = /((?:from\s+|import\()\s*)(['"])(\.\.?\/[^'"]*)\2/g;

/** Recursively collect every .js file under a directory. */
function collectJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectJsFiles(full));
    } else if (entry.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Resolve what an extensionless relative specifier should point to, relative
 * to the .js file that imports it: a sibling `<name>.js` file, or -- if no
 * such file exists -- a directory's `index.js`.
 */
function resolveExtension(fromFile, specifier) {
  const base = join(dirname(fromFile), specifier);
  if (existsSync(`${base}.js`)) return `${specifier}.js`;
  if (existsSync(join(base, 'index.js'))) return `${specifier}/index.js`;
  // Fall back to appending .js -- covers files not yet emitted at the time
  // this check runs (shouldn't happen post-tsc, but fail safe rather than
  // silently leaving the specifier broken).
  return `${specifier}.js`;
}

function fixFile(file) {
  const original = readFileSync(file, 'utf8');
  let changed = false;

  const fixed = original.replace(SPECIFIER_RE, (match, prefix, quote, specifier) => {
    if (/\.(js|json|node)$/.test(specifier)) return match; // already has an extension
    changed = true;
    const resolved = resolveExtension(file, specifier);
    return `${prefix}${quote}${resolved}${quote}`;
  });

  if (changed) writeFileSync(file, fixed, 'utf8');
  return changed;
}

if (!existsSync(distDir)) {
  console.error(`[fix-esm-extensions] dist/ not found at ${distDir} -- run tsc first`);
  process.exit(1);
}

const files = collectJsFiles(distDir);
let fixedCount = 0;
for (const file of files) {
  if (fixFile(file)) fixedCount++;
}

console.log(`[fix-esm-extensions] rewrote relative import extensions in ${fixedCount}/${files.length} files`);
