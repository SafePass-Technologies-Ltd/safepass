/**
 * Well-Known Routes — Universal Links (iOS) / App Links (Android)
 * domain-ownership verification for the org invite deep link
 * (APP_DEEP_LINK_BASE_URL, see join.routes.ts).
 *
 * Both files are public, static-ish JSON documents the respective OS
 * fetches directly (not through the app) to confirm this domain is allowed
 * to open the mobile app for matching URLs, before ever launching it --
 * this is what upgrades the plain browser landing page (join.routes.ts) to
 * an instant one-tap app open for a user who already has the app installed.
 *
 * Bundle/package identifiers are hardcoded below (not secrets -- publicly
 * visible in any App Store/Play Store listing or the app's own binary
 * regardless). Only the signing-identity values (Apple Team ID, Android
 * signing cert fingerprints) come from env vars, since those genuinely
 * can't be known/fabricated here -- see env.ts's APPLE_TEAM_ID and
 * ANDROID_SHA256_FINGERPRINTS.
 */
import { Hono } from 'hono';
import { env } from '../env';

export const wellKnownRoutes = new Hono();

const IOS_BUNDLE_ID = 'com.safepass-tech.safepassMobile';
const ANDROID_PACKAGE_NAME = 'com.safepasstech.safepass_mobile';

/**
 * GET /.well-known/apple-app-site-association
 *
 * Must be served with a JSON content type, no redirects, over HTTPS, at
 * exactly this path (no .json extension) -- Apple's requirements, not
 * negotiable. If APPLE_TEAM_ID isn't configured yet, `details` is empty --
 * a structurally valid AASA file that simply matches nothing, so iOS
 * always gets a well-formed response (never a 404) and Universal Links
 * activate automatically the moment the env var is set, no further
 * deploy/code change needed.
 */
wellKnownRoutes.get('/apple-app-site-association', (c) => {
  const appId = env.APPLE_TEAM_ID ? `${env.APPLE_TEAM_ID}.${IOS_BUNDLE_ID}` : null;

  return c.json(
    {
      applinks: {
        apps: [],
        details: appId ? [{ appID: appId, paths: ['/join/*'] }] : [],
      },
    },
    200,
    { 'Content-Type': 'application/json' }
  );
});

/**
 * GET /.well-known/assetlinks.json
 *
 * Android's equivalent -- fetched to verify this domain is allowed to
 * open the app for matching App Links (see the autoVerify intent-filter
 * in AndroidManifest.xml). Empty fingerprint list until
 * ANDROID_SHA256_FINGERPRINTS is configured -- same "always valid JSON,
 * never a hard failure" reasoning as the AASA route above.
 */
wellKnownRoutes.get('/assetlinks.json', (c) => {
  const fingerprints = env.ANDROID_SHA256_FINGERPRINTS
    ? env.ANDROID_SHA256_FINGERPRINTS.split(',').map((f) => f.trim()).filter(Boolean)
    : [];

  return c.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_PACKAGE_NAME,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
});
