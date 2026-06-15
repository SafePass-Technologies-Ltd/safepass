/// Firebase Auth — transport dashboard
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithPhoneNumber, RecaptchaVerifier, type Auth } from 'firebase/auth';

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length > 0 ? getApps()[0] : initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
    });
  }
  return app;
}

export function getFirebaseAuth(): Auth { if (!auth) auth = getAuth(getFirebaseApp()); return auth; }
export async function signInWithGoogle(): Promise<string> {
  const result = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
  return result.user.getIdToken();
}
export function setupRecaptcha(id: string): RecaptchaVerifier { return new RecaptchaVerifier(getFirebaseAuth(), id, { size: 'invisible' }); }
export async function signInWithPhone(phone: string, verifier: RecaptchaVerifier) { return signInWithPhoneNumber(getFirebaseAuth(), phone, verifier); }
