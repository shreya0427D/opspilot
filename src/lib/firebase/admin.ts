import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export const EMULATOR_PROJECT_ID = "demo-opspilot";

function emulatorMode() {
  return process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
}

function projectId() {
  return emulatorMode() ? EMULATOR_PROJECT_ID : process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
}

function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  if (emulatorMode()) {
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
  }

  // Google Cloud hosts (App Hosting) provide Application Default Credentials. Hosts outside
  // Google Cloud (Vercel) have none, so a service account is supplied through env vars instead.
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  return initializeApp({
    ...(!emulatorMode() && clientEmail && privateKey
      ? { credential: cert({ projectId: projectId(), clientEmail, privateKey }) }
      : {}),
    projectId: projectId(),
    storageBucket: emulatorMode()
      ? `${EMULATOR_PROJECT_ID}.appspot.com`
      : process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

// firebase-admin is shared across Next.js server bundles, but this module may be instantiated once
// per bundle, so the "already configured" flag must live on globalThis.
const configured = globalThis as unknown as { __opspilotFirestoreConfigured?: boolean };

export function adminDb() {
  const db = getFirestore(adminApp());
  if (!configured.__opspilotFirestoreConfigured) {
    configured.__opspilotFirestoreConfigured = true;
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Already configured by another bundle before this flag existed (e.g. after hot reload).
    }
  }
  return db;
}

export const adminAuth = () => getAuth(adminApp());
export const adminBucket = () => getStorage(adminApp()).bucket();
