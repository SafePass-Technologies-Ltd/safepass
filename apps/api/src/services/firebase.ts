import admin from 'firebase-admin';
import { env } from '../env';

// Initialize Firebase Admin SDK (idempotent).
// Credentials come from environment variables — injected by a secret manager
// in production or set directly in .env for local development.
const firebaseApp =
  admin.apps.length > 0
    ? admin.apps[0]!
    : admin.initializeApp({
        credential: admin.credential.cert({
          projectId: env.FIREBASE_PROJECT_ID!,
          clientEmail: env.FIREBASE_CLIENT_EMAIL!,
          privateKey: env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
        }),
      });

export { admin };
export { firebaseApp };
