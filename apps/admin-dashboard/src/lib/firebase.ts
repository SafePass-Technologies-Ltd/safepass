/// Firebase Web SDK — client-side initialization for Admin Dashboard.
///
/// Firebase is lazily initialized to avoid SSR crashes — the module exports
/// a getter function that only creates the Firebase app when first called.
///
/// Environment variables (NEXT_PUBLIC_FIREBASE_*) must be set in a .env.local
/// file at `apps/admin-dashboard/` for local development.

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

/** Cached Firebase App instance — initialized lazily on first access. */
let _app: FirebaseApp | null = null;

/** Cached Firebase Auth instance — derived from the lazy app. */
let _auth: Auth | null = null;

/**
 * Lazy-initialize Firebase App.
 *
 * Module-level calls to `initializeApp()` crash during Next.js SSR because
 * `process.env.NEXT_PUBLIC_*` variables are only available at build time
 * (inlined) for client bundles. This function defers initialization until
 * the first real access, which only happens client-side where the env vars
 * are actually available.
 */
function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  };

  _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
  return _app;
}

/**
 * Returns the Firebase Auth instance — initializes Firebase on first call.
 *
 * Usage:
 *   import { getFirebaseAuth } from '@/lib/firebase';
 *   const auth = getFirebaseAuth();
 */
export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(getFirebaseApp());
  return _auth;
}
