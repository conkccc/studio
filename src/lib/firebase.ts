import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

// Keep these accesses explicit: Next.js replaces public environment variables at build time.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Authentication does not require Storage, Messaging, Analytics or a Maps API key.
const required = [
  { name: 'NEXT_PUBLIC_FIREBASE_API_KEY', value: firebaseConfig.apiKey, example: 'your-public-firebase-api-key' },
  { name: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', value: firebaseConfig.authDomain, example: 'your-project.firebaseapp.com' },
  { name: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', value: firebaseConfig.projectId, example: 'your-project' },
];

export const missingFirebaseVariables = required
  .filter(({ value, example }) => !value?.trim() || value === example)
  .map(({ name }) => name);

export const firebaseConfigurationError = missingFirebaseVariables.length
  ? 'Firebase 로그인 설정이 아직 입력되지 않았습니다.'
  : null;

let clientAuth: Auth | undefined;

export function getClientAuth(): Auth {
  if (firebaseConfigurationError) throw new Error(firebaseConfigurationError);
  if (!clientAuth) {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    clientAuth = getAuth(app);
  }
  return clientAuth;
}
