
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';

// Ensure all necessary Firebase environment variables are present
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID; // Optional

// Check for Google Maps API Key as well
const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const missingVars: string[] = [];
if (!apiKey) missingVars.push('NEXT_PUBLIC_FIREBASE_API_KEY');
if (!authDomain) missingVars.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'); // Added check
if (!projectId) missingVars.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
if (!storageBucket) missingVars.push('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
if (!messagingSenderId) missingVars.push('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
if (!appId) missingVars.push('NEXT_PUBLIC_FIREBASE_APP_ID');
// measurementId is optional, so not checking it as strictly required for core functionality
// if (!measurementId) missingVars.push('NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID');

if (!googleMapsApiKey) missingVars.push('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');

if (missingVars.length > 0) {
  const errorMessage = `Firebase/Google Maps configuration is missing required environment variables: ${missingVars.join(', ')}. Please check your Vercel environment variable settings or .env file.`;
  console.error(errorMessage);
  // For server-side environments, throwing an error might be appropriate to halt execution.
  // For client-side, console.error might be sufficient, but app functionality will be broken.
  // During build or server-side rendering, this error will stop the process.
  if (typeof window === 'undefined') {
    throw new Error(errorMessage);
  }
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

// Initialize Firebase
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const db: Firestore = getFirestore(app);
const auth: Auth = getAuth(app);
const googleAuthProvider = new GoogleAuthProvider();

export { db, app, auth, googleAuthProvider };

