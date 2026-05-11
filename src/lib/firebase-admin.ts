// 서버 전용 Firebase Admin SDK 초기화
import { applicationDefault, initializeApp, getApps, cert, AppOptions } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

let adminApp;
const existingApps = getApps();

if (existingApps.length) {
  adminApp = existingApps[0];
} else {
  let credential;
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    credential = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credential = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  }

  try {
    const appOptions: AppOptions = credential
      ? { credential: cert(credential), projectId }
      : { credential: applicationDefault(), projectId };

    adminApp = initializeApp(appOptions);
    console.log('Firebase Admin SDK 초기화 성공');
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Firebase Admin SDK 초기화 중 오류 발생 (로컬 서비스 계정 또는 기본 자격 증명 없음):', error instanceof Error ? error.message : String(error));
    } else {
      console.error('Firebase Admin SDK 초기화 실패:', error instanceof Error ? error.message : String(error));
    }
    adminApp = undefined;
  }
}

export const adminDb = adminApp ? getAdminFirestore(adminApp) : undefined;
