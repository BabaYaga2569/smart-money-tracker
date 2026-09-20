// Run from backend/. Preview is the default; --apply writes staging rows only.
import admin from 'firebase-admin';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { createSign } from 'node:crypto';

const required = ['FIREBASE_SERVICE_ACCOUNT', 'PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV', 'SHEETS_USER_ID', 'SHEETS_SPREADSHEET_ID'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`);
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const apply = process.argv.includes('--apply');
const sheetName = 'Plaid_Transactions';
const cutoff = process.env.SHEETS_START_DATE || new Date(Date.now() - 35 * 86400000).toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error('SHEETS_START_DATE must be YYYY-MM-DD');
if (!['sandbox', 'development', 'production'].includes(process.env.PLAID_ENV)) throw new Error('Invalid PLAID_ENV');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const plaid = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV],
  baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID, 'PLAID-SECRET': process.env.PLAID_SECRET } }
}));

function base64url(value) { return Buffer.from(value).toString('base64url'); }

async function sheetsToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3500
  }));
  const input = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  signer.end();
  const assertion = `${input}.${signer.sign(serviceAccount.private_key).toString('base64url')}`;
  const response = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  if (!response.ok) throw new Error(`Google authorization failed (${response.status})`);
  return (await response.json()).access_token;
}

async function sheetsGet(token, range) {
  const id = encodeURIComponent(process.env.SHEETS_SPREADSHEET_ID);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Sheets GET failed (${response.status}): ${(await response.text()).slice(0, 250)}`);
  return response.json();
}

async function sheetsPut(token, range, values) {
  const id = encodeURIComponent(process.env.SHEETS_SPREADSHEET_ID);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values })
  });
  if (!response.ok) throw new Error(`Sheets PUT failed (${response.status}): ${(await response.text()).slice(0, 250)}`);
  return response.json();
}

function sheetDateSerial(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error('Unexpected Plaid transaction date');
  const [year, month, day] = isoDate.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day);
  if (new Date(utc).toISOString().slice(0, 10) !== isoDate) throw new Error('Invalid Plaid transaction date');
  return (utc - Date.UTC(1899, 11, 30)) / 86400000;
}

async function formatStagingDateColumn(token) {
  const id = encodeURIComponent(process.env.SHEETS_SPREADSHEET_ID);
  const root = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
  const headers = { Authorization: `Bearer ${token}` };
  const metadata = await fetch(`${root}?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))`, { headers });
  if (!metadata.ok) throw new Error(`Sheets metadata failed (${metadata.status})`);
  const tab = (await metadata.json()).sheets?.find(sheet => sheet.properties.title === sheetName)?.properties;
  if (!tab) throw new Error('Plaid_Transactions tab not found');

  const body = {
    requests: [{
      repeatCell: {
        range: {
          sheetId: tab.sheetId,
          startRowIndex: 1,
          endRowIndex: tab.gridProperties.rowCount,
          startColumnIndex: 1,
          endColumnIndex: 2
        },
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'mm/dd/yyyy' } } },
        fields: 'userEnteredFormat.numberFormat'
      }
    }]
  };
  const result = await fetch(`${root}:batchUpdate`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!result.ok) throw new Error(`Sheets date formatting failed (${result.status}): ${(await result.text()).slice(0, 250)}`);
}

function rowFor(transaction, account, institution, bank) {
  const date = transaction.authorized_date || transaction.date;
  const description = String(transaction.merchant_name || transaction.name || '')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 250);
  const note = `${transaction.pending ? 'PENDING; ' : ''}${transaction.pending_transaction_id ? 'Posted from pending transaction ' + transaction.pending_transaction_id + '; ' : ''}Plaid account ${account.name || 'Checking'} (${account.account_id}); ${institution}; imported for review`;
  return [
    transaction.transaction_id,
    sheetDateSerial(date),
    description,
    -Number(transaction.amount),
    bank,
    'Uncategorized',
    transaction.pending,
    'REVIEW',
    '',
    '',
    note
  ];
}

async function main() {
  const token = await sheetsToken();
  const sheet = await sheetsGet(token, `${sheetName}!A:K`);
  const rows = sheet.values || [];

  if (!rows.length || !/transaction.*id/i.test(String(rows[0][0] || ''))) {
    throw new Error('Unexpected staging header; inspect Plaid_Transactions before running');
  }
  if (String(rows[0][6]).toLowerCase() !== 'pending' || String(rows[0][7]).toLowerCase() !== 'match status') {
    throw new Error('Unexpected staging columns');
  }

  const mapRows = (await sheetsGet(token, 'Account_Map!A:D')).values || [];
  const bankMap = new Map(
    mapRows.slice(1)
      .filter(r => String(r[3]).toUpperCase() === 'TRUE')
      .map(r => [String(r[1]).trim().toLowerCase(), String(r[2]).trim()])
  );

  const knownById = new Map();
  rows.slice(1).forEach((row, index) => {
    const id = String(row[0] || '').trim();
    if (id) knownById.set(id, { sheetRow: index + 2, row });
  });

  const itemDocs = await db.collection('users')
    .doc(process.env.SHEETS_USER_ID)
    .collection('plaid_items')
    .where('status', '==', 'active')
    .get();

  if (itemDocs.empty) throw new Error('No active Plaid Items for selected Firebase user');

  const staged = [];
  const replacements = [];
  const counts = [];

  for (const doc of itemDocs.docs) {
    const item = doc.data();
    if (!item.accessToken) continue;

    const bank = bankMap.get(String(item.institutionName || '').trim().toLowerCase());
    if (!bank) {
      counts.push({ institution: item.institutionName || 'Unknown bank', skipped: 'Not in active Account_Map' });
      continue;
    }

    const accounts = (await plaid.accountsGet({ access_token: item.accessToken })).data.accounts;
    const selected = accounts.filter(a => a.type === 'depository' && a.subtype === 'checking');
    const byId = new Map(selected.map(a => [a.account_id, a]));
    if (!selected.length) continue;

    let cursor = null;
    let more = true;
    let pages = 0;
    let newCount = 0;
    let replacementCount = 0;

    do {
      const data = (await plaid.transactionsSync({ access_token: item.accessToken, cursor })).data;

      for (const tx of [...data.added, ...data.modified]) {
        if (!byId.has(tx.account_id) || tx.date < cutoff) continue;

        if (knownById.has(tx.transaction_id)) continue;

        const pendingId = String(tx.pending_transaction_id || '').trim();
        if (!tx.pending && pendingId && knownById.has(pendingId)) {
          const existing = knownById.get(pendingId);
          const replacementRow = rowFor(
            tx,
            byId.get(tx.account_id),
            item.institutionName || 'Unknown bank',
            bank
          );
          replacements.push({ sheetRow: existing.sheetRow, values: replacementRow, pendingId, postedId: tx.transaction_id });
          knownById.delete(pendingId);
          knownById.set(tx.transaction_id, { sheetRow: existing.sheetRow, row: replacementRow });
          replacementCount++;
          continue;
        }

        const newRow = rowFor(
          tx,
          byId.get(tx.account_id),
          item.institutionName || 'Unknown bank',
          bank
        );
        staged.push(newRow);
        knownById.set(tx.transaction_id, { sheetRow: null, row: newRow });
        newCount++;
      }

      cursor = data.next_cursor;
      more = data.has_more;
      if (++pages > 100) throw new Error('Plaid pagination limit reached; no rows written');
    } while (more);

    counts.push({
      institution: item.institutionName || 'Unknown bank',
      checkingAccounts: selected.length,
      newTransactions: newCount,
      postedReplacements: replacementCount
    });
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'preview',
    since: cutoff,
    counts,
    totalNew: staged.length,
    totalPostedReplacements: replacements.length
  }, null, 2));

  if (!apply) return;

  await formatStagingDateColumn(token);

  for (const replacement of replacements) {
    const range = `${sheetName}!A${replacement.sheetRow}:K${replacement.sheetRow}`;
    await sheetsPut(token, range, [replacement.values]);
    console.log(`Replaced pending transaction ${replacement.pendingId} with posted ${replacement.postedId} on row ${replacement.sheetRow}.`);
  }

  if (staged.length) {
    const startRow = Math.max(2, rows.length + 1);
    for (let i = 0; i < staged.length; i += 200) {
      const batch = staged.slice(i, i + 200);
      const batchStart = startRow + i;
      const batchEnd = batchStart + batch.length - 1;
      await sheetsPut(token, `${sheetName}!A${batchStart}:K${batchEnd}`, batch);
    }
    console.log(`Staged ${staged.length} new transactions for review starting on row ${startRow}.`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
