// Read-only Firestore audit for the family-finances bridge.
// No Firestore writes. No Plaid calls. No Google Sheets writes.
// Sensitive identifiers are redacted before logging.

import admin from 'firebase-admin';

const required = ['FIREBASE_SERVICE_ACCOUNT', 'SHEETS_USER_ID'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const userId = process.env.SHEETS_USER_ID;
const userRef = db.collection('users').doc(userId);

function suffix(value, keep = 6) {
  const s = String(value || '');
  if (!s) return null;
  return s.length <= keep ? '*'.repeat(s.length) : `…${s.slice(-keep)}`;
}

function iso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function dateOnly(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function countBy(values) {
  const out = {};
  for (const value of values) {
    const key = String(value ?? 'missing');
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

const userDoc = await userRef.get();
const collections = await userRef.listCollections();
const collectionNames = collections.map(c => c.id).sort();

const settingsRef = userRef.collection('settings').doc('personal');
const settingsDoc = await settingsRef.get();
const settings = settingsDoc.exists ? settingsDoc.data() : {};
const plaidAccounts = Array.isArray(settings.plaidAccounts) ? settings.plaidAccounts : [];

const accountById = new Map();
for (const a of plaidAccounts) {
  if (a.account_id) accountById.set(String(a.account_id), a);
}

const accountKey = a => [
  String(a.institution_name || a.institutionName || '').trim().toLowerCase(),
  String(a.mask || '').trim(),
  String(a.type || '').trim().toLowerCase(),
  String(a.subtype || '').trim().toLowerCase()
].join('|');

const duplicateAccountKeys = [];
const seenAccountKeys = new Map();
for (const a of plaidAccounts) {
  const key = accountKey(a);
  if (seenAccountKeys.has(key)) duplicateAccountKeys.push(key);
  else seenAccountKeys.set(key, true);
}

const itemSnap = await userRef.collection('plaid_items').get();
const items = itemSnap.docs.map(d => ({ id: d.id, ...d.data() }));

const txSnap = await userRef.collection('transactions').get();
const txs = txSnap.docs.map(d => ({ _docId: d.id, ...d.data() }));

const dates = txs.map(t => dateOnly(t.authorized_date || t.date)).filter(Boolean).sort();
const accountIdsInTx = [...new Set(txs.map(t => String(t.account_id || '')).filter(Boolean))];
const orphanAccountIds = accountIdsInTx.filter(id => !accountById.has(id));

const txIdCounts = new Map();
for (const t of txs) {
  const id = String(t.transaction_id || t._docId || '');
  if (!id) continue;
  txIdCounts.set(id, (txIdCounts.get(id) || 0) + 1);
}
const duplicateTransactionIds = [...txIdCounts.entries()].filter(([, n]) => n > 1);

const pendingLinkCounts = new Map();
for (const t of txs) {
  const p = String(t.pending_transaction_id || '').trim();
  if (!p) continue;
  pendingLinkCounts.set(p, (pendingLinkCounts.get(p) || 0) + 1);
}
const duplicatePendingLinks = [...pendingLinkCounts.entries()].filter(([, n]) => n > 1);

const missing = {
  transaction_id: txs.filter(t => !t.transaction_id).length,
  account_id: txs.filter(t => !t.account_id).length,
  date: txs.filter(t => !(t.authorized_date || t.date)).length,
  amount: txs.filter(t => t.amount === undefined || t.amount === null || Number.isNaN(Number(t.amount))).length,
  account_type: txs.filter(t => !t.account_type).length,
  account_subtype: txs.filter(t => !t.account_subtype).length
};

const perAccount = accountIdsInTx.map(id => {
  const a = accountById.get(id) || {};
  const rows = txs.filter(t => String(t.account_id || '') === id);
  return {
    account: {
      institution: a.institution_name || a.institutionName || rows[0]?.institution_name || 'Unknown',
      name: a.name || rows[0]?.account_name || 'Unknown',
      mask: a.mask || rows[0]?.mask || null,
      type: a.type || rows[0]?.account_type || null,
      subtype: a.subtype || rows[0]?.account_subtype || null,
      accountId: suffix(id)
    },
    transactions: rows.length,
    pending: rows.filter(t => Boolean(t.pending)).length,
    latestDate: rows.map(t => dateOnly(t.authorized_date || t.date)).filter(Boolean).sort().slice(-1)[0] || null
  };
}).sort((a,b) => String(a.account.institution).localeCompare(String(b.account.institution)));

const findings = [];
if (!settingsDoc.exists) findings.push('settings/personal is missing');
if (!plaidAccounts.length) findings.push('settings/personal.plaidAccounts is empty');
if (duplicateAccountKeys.length) findings.push(`${duplicateAccountKeys.length} duplicate account metadata key(s) found`);
if (orphanAccountIds.length) findings.push(`${orphanAccountIds.length} transaction account_id value(s) are not represented in settings/personal.plaidAccounts`);
if (duplicateTransactionIds.length) findings.push(`${duplicateTransactionIds.length} duplicate transaction_id value(s) found`);
if (duplicatePendingLinks.length) findings.push(`${duplicatePendingLinks.length} pending_transaction_id value(s) point to multiple posted rows`);
if (missing.transaction_id || missing.account_id || missing.date || missing.amount) {
  findings.push('One or more transaction rows are missing core fields');
}
if (items.some(i => i.status && !['active','NEEDS_REAUTH'].includes(i.status))) {
  findings.push('One or more Plaid items have an unexpected status');
}
if (items.some(i => i.status === 'NEEDS_REAUTH')) {
  findings.push('One or more Plaid items require reauthentication');
}

const report = {
  auditMode: 'READ_ONLY',
  firestoreWrites: false,
  plaidCalls: false,
  sheetsWrites: false,
  userDocumentExists: userDoc.exists,
  userSubcollections: collectionNames,
  settings: {
    personalExists: settingsDoc.exists,
    plaidAccounts: plaidAccounts.length,
    accountTypes: countBy(plaidAccounts.map(a => a.type || 'missing')),
    accountSubtypes: countBy(plaidAccounts.map(a => a.subtype || 'missing')),
    institutions: countBy(plaidAccounts.map(a => a.institution_name || a.institutionName || 'Unknown')),
    duplicateAccountMetadataKeys: duplicateAccountKeys.length,
    lastBalanceUpdate: iso(settings.lastBalanceUpdate),
    lastAccountMetadataBackfill: iso(settings.lastAccountMetadataBackfill)
  },
  plaidItems: {
    count: items.length,
    statuses: countBy(items.map(i => i.status || 'missing')),
    cursorPresent: items.filter(i => Boolean(i.cursor)).length,
    cursorMissing: items.filter(i => !i.cursor).length,
    institutions: items.map(i => ({
      institution: i.institutionName || 'Unknown',
      status: i.status || 'missing',
      itemId: suffix(i.itemId || i.id),
      cursorPresent: Boolean(i.cursor),
      lastSyncedAt: iso(i.lastSyncedAt),
      updatedAt: iso(i.updatedAt)
    }))
  },
  transactions: {
    count: txs.length,
    earliestDate: dates[0] || null,
    latestDate: dates.slice(-1)[0] || null,
    pending: txs.filter(t => Boolean(t.pending)).length,
    posted: txs.filter(t => !t.pending).length,
    manual: txs.filter(t => Boolean(t.manual)).length,
    institutions: countBy(txs.map(t => t.institution_name || 'Unknown')),
    missing,
    duplicateTransactionIds: duplicateTransactionIds.length,
    duplicatePendingLinks: duplicatePendingLinks.length,
    orphanAccountIds: orphanAccountIds.map(id => suffix(id)),
    byAccount: perAccount
  },
  findings
};

console.log('=== FIRESTORE FAMILY FINANCES READ-ONLY AUDIT ===');
console.log(JSON.stringify(report, null, 2));
