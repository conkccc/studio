// firebase.ts: 클라이언트 SDK만 남기고, admin 관련 코드는 제거
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID; // Optional
const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const requiredPublicVars: { key: string; value: string | undefined }[] = [
  { key: 'NEXT_PUBLIC_FIREBASE_API_KEY', value: apiKey },
  { key: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', value: authDomain },
  { key: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', value: projectId },
  { key: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', value: storageBucket },
  { key: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', value: messagingSenderId },
  { key: 'NEXT_PUBLIC_FIREBASE_APP_ID', value: appId },
  { key: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', value: googleMapsApiKey },
  // { key: 'NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID', value: googleMapsMapId },
];

const missingVars = requiredPublicVars.filter(v => !v.value);
if (missingVars.length > 0) {
  const errorMessage = `CRITICAL ERROR: Firebase/Google Maps configuration is missing required environment variables: ${missingVars.map(v => v.key).join(', ')}. Please check your Vercel environment variable settings or .env file.`;
  console.error(errorMessage); // Log to server console
  // For server-side environments or build time, throwing an error can be more direct
  if (typeof window === 'undefined') {
    throw new Error(errorMessage);
  }
  // For client-side, console.error is already shown. App might not function correctly.
}

const firebaseConfig: { [key: string]: string | undefined } = {
  apiKey: apiKey,
  authDomain: authDomain,
  projectId: projectId,
  storageBucket: storageBucket,
  messagingSenderId: messagingSenderId,
  appId: appId,
};

if (measurementId) {
  firebaseConfig.measurementId = measurementId;
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);
