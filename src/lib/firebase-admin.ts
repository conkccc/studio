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
  }

  // 빌드 환경에서는 서비스 계정 정보가 없어도 오류를 발생시키지 않도록 처리
  if (credential) {
    try {
      adminApp = initializeApp({
        credential: cert(credential),
      } as AppOptions);
    } catch (error) {
      console.warn('Firebase Admin SDK 초기화 중 오류 발생 (더미 키 또는 잘못된 형식의 키 사용 가능성):', error instanceof Error ? error.message : String(error));
      adminApp = undefined; // 오류 발생 시 adminApp을 undefined로 명시적 설정
    }
  } else if (process.env.NODE_ENV !== 'production') {
    console.warn('Firebase Admin 서비스 계정 정보가 없어 Admin SDK가 초기화되지 않았습니다. 빌드 목적이거나, 서버사이드 기능이 필요없는 경우 무시할 수 있습니다.');
  }
  // adminApp이 초기화되지 않았으면 adminDb도 정상적으로 작동하지 않을 것임.
}

export const adminDb = adminApp ? getAdminFirestore() : undefined;
