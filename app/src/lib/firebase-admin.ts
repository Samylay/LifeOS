// Server-side Firebase Admin SDK — used to verify ID tokens and access Firestore in API routes

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App | null = null;
let adminAuth: Auth | null = null;
let adminDb: Firestore | null = null;

function getAdminApp(): App {
  if (app) return app;

  if (getApps().length > 0) {
    app = getApps()[0];
  } else {
    // Use application default credentials or service account
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccount) {
      app = initializeApp({
        credential: cert(JSON.parse(serviceAccount)),
      });
    } else {
      // Falls back to GOOGLE_APPLICATION_CREDENTIALS env var or
      // auto-detection in GCP environments
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      app = initializeApp({ projectId: projectId || undefined });
    }
  }
  return app;
}

export function getAdminAuth(): Auth {
  if (adminAuth) return adminAuth;
  adminAuth = getAuth(getAdminApp());
  return adminAuth;
}

export function getAdminDb(): Firestore {
  if (adminDb) return adminDb;
  adminDb = getFirestore(getAdminApp());
  return adminDb;
}
