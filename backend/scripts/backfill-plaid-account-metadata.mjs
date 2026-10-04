// Safely backfill Plaid account metadata into Firestore.
// This script calls Plaid /accounts/get only. It does NOT call /transactions/sync,
// does NOT advance transaction cursors, and does NOT write Google Sheets.

import admin from 'firebase-admin';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const required = [
  'FIREBASE_SERVICE_ACCOUNT',
  'PLAID_CLIENT_ID',
  'PLAID_SECRET',
  'PLAID_ENV',
  'SHEETS_USER_ID'
];

for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}

if (!['sandbox', 'development', 'production'].includes(process.env.PLAID_ENV)) {
  throw new Error('Invalid PLAID_ENV');
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const plaid = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET
    }
  }
}));

const userId = process.env.SHEETS_USER_ID;
const itemsSnap = await db
  .collection('users')
  .doc(userId)
  .collection('plaid_items')
  .where('status', '==', 'active')
  .get();

if (itemsSnap.empty) {
  throw new Error('No active Plaid items found for configured user');
}

const discovered = [];
const perInstitution = [];

for (const itemDoc of itemsSnap.docs) {
  const item = itemDoc.data();
  if (!item.accessToken) continue;

  const response = await plaid.accountsGet({ access_token: item.accessToken });
  const accounts = response.data.accounts || [];
  const institutionName = String(item.institutionName || 'Unknown').trim();

  for (const account of accounts) {
    discovered.push({
      account_id: account.account_id,
      name: account.name,
      official_name: account.official_name || null,
      mask: account.mask || null,
      type: account.type,
      subtype: account.subtype || null,
      institution_name: institutionName,
      institution_id: item.institutionId || null,
      item_id: item.itemId || itemDoc.id,
      available_balance: account.balances?.available ?? account.balances?.current ?? 0,
      current_balance: account.balances?.current ?? 0,
      balance: account.balances?.available ?? account.balances?.current ?? 0,
      balances: {
        available: account.balances?.available ?? null,
        current: account.balances?.current ?? 0,
        limit: account.balances?.limit ?? null,
        iso_currency_code: account.balances?.iso_currency_code ?? 'USD',
        unofficial_currency_code: account.balances?.unofficial_currency_code ?? null
      },
      metadataBackfilledAt: new Date().toISOString()
    });
  }

  perInstitution.push({
    institution: institutionName,
    accounts: accounts.length,
    checking: accounts.filter(account =>
      String(account.type || '').toLowerCase() === 'depository' &&
      String(account.subtype || '').toLowerCase() === 'checking'
    ).length
  });
}

if (!discovered.length) {
  throw new Error('Plaid /accounts/get returned no accounts');
}

const settingsRef = db
  .collection('users')
  .doc(userId)
  .collection('settings')
  .doc('personal');

const settingsDoc = await settingsRef.get();
const current = settingsDoc.exists ? settingsDoc.data() : {};
const existing = Array.isArray(current.plaidAccounts) ? current.plaidAccounts : [];

const mergedByKey = new Map();

for (const account of existing) {
  const key = account.account_id
    ? `id:${account.account_id}`
    : `fallback:${String(account.institution_name || '').toLowerCase()}:${account.mask || ''}`;
  mergedByKey.set(key, account);
}

for (const account of discovered) {
  const idKey = `id:${account.account_id}`;
  const fallbackKey = `fallback:${String(account.institution_name || '').toLowerCase()}:${account.mask || ''}`;

  let previous = mergedByKey.get(idKey);
  if (!previous && account.mask) previous = mergedByKey.get(fallbackKey);

  mergedByKey.delete(fallbackKey);
  mergedByKey.set(idKey, { ...(previous || {}), ...account });
}

const plaidAccounts = [...mergedByKey.values()];

await settingsRef.set({
  plaidAccounts,
  lastAccountMetadataBackfill: admin.firestore.FieldValue.serverTimestamp()
}, { merge: true });

console.log(JSON.stringify({
  mode: 'account-metadata-backfill',
  plaidEndpoint: '/accounts/get',
  transactionCursorChanged: false,
  sheetsWritten: false,
  activeItems: itemsSnap.size,
  accountsDiscovered: discovered.length,
  checkingAccounts: discovered.filter(account =>
    String(account.type || '').toLowerCase() === 'depository' &&
    String(account.subtype || '').toLowerCase() === 'checking'
  ).length,
  perInstitution
}, null, 2));
