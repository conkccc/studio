import 'server-only';

import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, initializeFirestore } from 'firebase-admin/firestore';

// Initialize on the first request so builds do not require runtime credentials.
function getAdminApp(): App {
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  let credential;
  if (serviceAccount) {
    let parsed;
    try { parsed = JSON.parse(serviceAccount); }
    catch { parsed = JSON.parse(Buffer.from(serviceAccount, 'base64').toString('utf8')); }
    credential = cert(parsed);
  } else {
    // Vercel has no Google metadata server. Fail promptly if its credential is missing.
    if (process.env.VERCEL && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw Object.assign(new Error('Firebase server credentials are missing.'), { code: 'app/invalid-credential' });
    }
    credential = applicationDefault();
  }
  return initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

export function getAdminDb() {
  const app = getAdminApp();
  try {
    return initializeFirestore(app, { preferRest: true });
  } catch (error) {
    // Development hot reload can retain the instance created by the previous code.
    if (process.env.NODE_ENV === 'development' && error && typeof error === 'object' &&
        'code' in error && error.code === 'firestore/failed-precondition') return getFirestore(app);
    throw error;
  }
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}
