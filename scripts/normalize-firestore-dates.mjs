import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore, Timestamp } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
if (process.argv.some(argument => argument.startsWith('--') && argument !== '--apply')) {
  throw new Error('기본 실행은 점검 전용입니다. 저장하려면 --apply만 사용하세요.');
}
initializeApp({
  credential: process.env.FIREBASE_SERVICE_ACCOUNT ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) : applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});
const db = getFirestore();
const fields = ['createdAt', 'dateTime', 'endTime', 'date', 'shareExpiryDate', 'submittedAt', 'settledReserveFundAt'];
const groups = ['users', 'friends', 'friendGroups', 'meetings', 'meetingPreps', 'expenses', 'participantAvailabilities', 'reserveFundTransactions'];
console.log(apply ? '문자열 날짜를 Timestamp로 저장합니다.' : '점검 전용: 데이터는 변경하지 않습니다.');
for (const group of groups) {
  let cursor;
  let scanned = 0, candidates = 0, changed = 0, invalid = 0;
  while (true) {
    let query = db.collectionGroup(group).orderBy(FieldPath.documentId()).select(...fields).limit(400);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const document of page.docs) {
      scanned++;
      const updates = {};
      for (const field of fields) {
        const value = document.data()[field];
        if (typeof value !== 'string') continue;
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) { invalid++; continue; }
        updates[field] = Timestamp.fromDate(date);
      }
      if (!Object.keys(updates).length) continue;
      candidates++;
      if (apply) {
        // Recheck before writing so a concurrent edit is never replaced by a stale value.
        const wrote = await db.runTransaction(async transaction => {
          const current = await transaction.get(document.ref);
          if (!current.exists) return false;
          const safe = Object.fromEntries(Object.entries(updates).filter(([field]) => current.data()[field] === document.data()[field]));
          if (!Object.keys(safe).length) return false;
          transaction.update(document.ref, safe);
          return true;
        });
        if (wrote) changed++;
      }
    }
    cursor = page.docs[page.docs.length - 1];
  }
  console.log(`${group}: 조회 ${scanned}, 변경 대상 ${candidates}, 저장 ${changed}, 확인 필요한 날짜 ${invalid}`);
}
