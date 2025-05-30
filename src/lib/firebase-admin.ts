// 서버 전용 Firebase Admin SDK 초기화
import { initializeApp, getApps, cert, AppOptions } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

let adminApp;
if (!getApps().length) {
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    credential = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const fs = require('fs');
    credential = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  } else {
    throw new Error('Firebase Admin 서비스 계정 정보가 없습니다.');
  }
  adminApp = initializeApp({
    credential: cert(credential),
  } as AppOptions);
}

export const adminDb = getAdminFirestore();
