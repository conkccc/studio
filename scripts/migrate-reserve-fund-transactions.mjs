import fs from 'node:fs';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_LIMIT = 450;

function getCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')));
  }

  return applicationDefault();
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function roundAmount(value) {
  return Number(value.toFixed(2));
}

if (!getApps().length) {
  initializeApp({
    credential: getCredential(),
  });
}

const db = getFirestore();
const snapshot = await db
  .collection('reserveFundTransactions')
  .where('type', '==', 'meeting_deduction')
  .get();

const byMeeting = new Map();

for (const docSnap of snapshot.docs) {
  const data = docSnap.data();
  const meetingId = data.meetingId;
  if (!meetingId) continue;

  const amount = typeof data.amount === 'number' ? Math.abs(data.amount) : 0;
  const date = toDate(data.date);
  const current = byMeeting.get(meetingId) || {
    amount: 0,
    latestDate: null,
    transactionIds: [],
  };

  current.amount = roundAmount(current.amount + amount);
  current.transactionIds.push(docSnap.id);
  if (date && (!current.latestDate || date > current.latestDate)) {
    current.latestDate = date;
  }
  byMeeting.set(meetingId, current);
}

console.log(`Found ${snapshot.size} deduction transactions for ${byMeeting.size} meetings.`);

let batch = db.batch();
let pendingWrites = 0;
let migrated = 0;
let missingMeetings = 0;

async function commitIfNeeded(force = false) {
  if (pendingWrites === 0 || (!force && pendingWrites < BATCH_LIMIT)) return;
  await batch.commit();
  batch = db.batch();
  pendingWrites = 0;
}

for (const [meetingId, summary] of byMeeting.entries()) {
  const meetingRef = db.collection('meetings').doc(meetingId);
  const meetingSnap = await meetingRef.get();

  if (!meetingSnap.exists) {
    missingMeetings += 1;
    console.warn(`Skipping missing meeting ${meetingId}. Transactions: ${summary.transactionIds.join(', ')}`);
    continue;
  }

  const update = {
    settledReserveFundAmount: summary.amount,
    settledReserveFundAt: summary.latestDate ? Timestamp.fromDate(summary.latestDate) : FieldValue.serverTimestamp(),
    reserveFundMigration: {
      source: 'reserveFundTransactions',
      migratedAt: FieldValue.serverTimestamp(),
      transactionIds: summary.transactionIds,
    },
  };

  if (DRY_RUN) {
    console.log(`[dry-run] ${meetingId}: ${summary.amount}`);
  } else {
    batch.set(meetingRef, update, { merge: true });
    pendingWrites += 1;
    await commitIfNeeded();
  }

  migrated += 1;
}

if (!DRY_RUN) {
  await commitIfNeeded(true);
}

console.log(`${DRY_RUN ? 'Checked' : 'Migrated'} ${migrated} meetings. Missing meetings: ${missingMeetings}.`);
