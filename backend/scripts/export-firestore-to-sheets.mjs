// Preview/apply the Firebase -> Google Sheets staging bridge.
// Run from backend/.
// Preview: node scripts/export-firestore-to-sheets.mjs
// Apply:   node scripts/export-firestore-to-sheets.mjs --apply
//
// This script DOES NOT call Plaid and DOES NOT advance Plaid cursors.

import admin from 'firebase-admin';
import { bridgeFirebaseTransactionsToSheets } from '../utils/googleSheetsBridge.js';

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error('Missing FIREBASE_SERVICE_ACCOUNT');
}
if (!process.env.SHEETS_USER_ID) {
  throw new Error('Missing SHEETS_USER_ID');
}
if (!process.env.SHEETS_SPREADSHEET_ID) {
  throw new Error('Missing SHEETS_SPREADSHEET_ID');
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const apply = process.argv.includes('--apply');

try {
  const result = await bridgeFirebaseTransactionsToSheets({
    db,
    userId: process.env.SHEETS_USER_ID,
    apply,
    force: true
  });

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
