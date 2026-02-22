// Server-side only — Firebase Admin SDK for token verification in API routes
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let adminApp: App | null = null;
let adminAuth: Auth | null = null;

function getAdminApp(): App {
  if (adminApp) return adminApp;

  const existing = getApps();
  if (existing.length > 0) {
    adminApp = existing[0];
    return adminApp;
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    try {
      const sa = JSON.parse(serviceAccountKey);
      adminApp = initializeApp({ credential: cert(sa) });
    } catch {
      // Malformed key — fall back to application default credentials
      adminApp = initializeApp();
    }
  } else {
    // Uses GOOGLE_APPLICATION_CREDENTIALS or ADC
    adminApp = initializeApp();
  }

  return adminApp;
}

export function getAdminAuth(): Auth {
  if (adminAuth) return adminAuth;
  adminAuth = getAuth(getAdminApp());
  return adminAuth;
}
