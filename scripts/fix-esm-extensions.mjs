#!/usr/bin/env node
/**
 * Postbuild step: rewrite extensionless relative import/export specifiers in
 * a compiled `<dist>/**\/*.js` output tree to include an explicit `.js`
 * extension (or `/index.js` for directory imports).
 *
 * WHY THIS EXISTS: both apps/api and packages/shared use tsconfig's
 * `"module": "ESNext"` / `"moduleResolution": "bundler"`, which lets
 * TypeScript source freely write extensionless relative imports like
 * `from './index'`. That's fine for the type-checker, and fine for `tsx`
 * (dev) which resolves extensions itself -- but plain `tsc` does NOT
 * rewrite or add extensions when it transpiles .ts to .js, and both
 * packages ship as plain Node.js ESM (`"type": "module"`, run directly
 * with `node`, not through a bundler). Node's native ESM resolver requires
 * fully specified relative specifiers -- it does not guess `.js` or
 * `/index.js` the way CommonJS `require()` or a bundler would. Without
 * this fix, every relative import in the compiled output fails at startup
 * with ERR_MODULE_NOT_FOUND (file specifiers) or ERR_UNSUPPORTED_DIR_IMPORT
 * (directory specifiers).
 *
 * Usage: node scripts/fix-esm-extensions.mjs <path-to-dist-dir>
 * Run after `tsc` in each package's `build` script. Rewrites only relative
 * specifiers (starting with `./` or `../`) in import/export statements and
 * dynamic `import()` calls -- package imports (`hono`, `@safepass/shared`,
 * `node:*`, etc.) are left untouched since Node already resolves those via
 * node_modules/package exports.
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const distArg = process.argv[2];
if (!distArg) {
  console.error('[fix-esm-extensions] usage: node fix-esm-extensions.mjs <path-to-dist-dir>');
  process.exit(1);
}
const distDir = resolve(process.cwd(), distArg);

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
  console.error(`[fix-esm-extensions] dist dir not found at ${distDir} -- run tsc first`);
  process.exit(1);
}

const files = collectJsFiles(distDir);
let fixedCount = 0;
for (const file of files) {
  if (fixFile(file)) fixedCount++;
}

console.log(`[fix-esm-extensions] rewrote relative import extensions in ${fixedCount}/${files.length} files (${distDir})`);
