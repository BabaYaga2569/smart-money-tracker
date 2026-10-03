import { createSign } from 'node:crypto';

const DEFAULT_SHEET_NAME = 'Plaid_Transactions';

function envTrue_(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function base64url_(value) {
  return Buffer.from(value).toString('base64url');
}

function parseServiceAccount_() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT');
  }
  try {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (error) {
    throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT JSON: ${error.message}`);
  }
}

async function sheetsToken_(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url_(JSON.stringify({
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
  if (!response.ok) {
    throw new Error(`Google authorization failed (${response.status}): ${(await response.text()).slice(0, 250)}`);
  }
  return (await response.json()).access_token;
}

async function sheetsGet_(token, spreadsheetId, range) {
  const id = encodeURIComponent(spreadsheetId);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`Sheets GET failed (${response.status}): ${(await response.text()).slice(0, 250)}`);
  }
  return response.json();
}

async function sheetsPut_(token, spreadsheetId, range, values) {
  const id = encodeURIComponent(spreadsheetId);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values })
  });
  if (!response.ok) {
    throw new Error(`Sheets PUT failed (${response.status}): ${(await response.text()).slice(0, 250)}`);
  }
  return response.json();
}

async function formatDateColumn_(token, spreadsheetId, sheetName) {
  const id = encodeURIComponent(spreadsheetId);
  const root = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
  const headers = { Authorization: `Bearer ${token}` };
  const metadata = await fetch(
    `${root}?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))`,
    { headers }
  );
  if (!metadata.ok) {
    throw new Error(`Sheets metadata failed (${metadata.status}): ${(await metadata.text()).slice(0, 250)}`);
  }

  const tab = (await metadata.json()).sheets
    ?.find(sheet => sheet.properties.title === sheetName)
    ?.properties;
  if (!tab) throw new Error(`${sheetName} tab not found`);

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
  if (!result.ok) {
    throw new Error(`Sheets date formatting failed (${result.status}): ${(await result.text()).slice(0, 250)}`);
  }
}

function sheetDateSerial_(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new Error(`Unexpected transaction date: ${isoDate}`);
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day);
  if (new Date(utc).toISOString().slice(0, 10) !== isoDate) {
    throw new Error(`Invalid transaction date: ${isoDate}`);
  }
  return (utc - Date.UTC(1899, 11, 30)) / 86400000;
}

function toIsoDate_(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value?.toDate instanceof Function) {
    return value.toDate().toISOString().slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function buildRow_(transaction, account, institution, bank) {
  const date = toIsoDate_(transaction.authorized_date || transaction.date);
  const description = String(transaction.merchant_name || transaction.name || '')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 250);
  const pendingId = String(transaction.pending_transaction_id || '').trim();
  const note =
    `${transaction.pending ? 'PENDING; ' : ''}` +
    `${pendingId ? `Posted from pending transaction ${pendingId}; ` : ''}` +
    `Plaid account ${account.name || 'Checking'} (${transaction.account_id || account.account_id || ''}); ` +
    `${institution}; imported for review`;

  const amount = Number(transaction.amount);
  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid Firebase transaction amount for ${transaction.transaction_id || ''}`);
  }

  return [
    String(transaction.transaction_id || '').trim(),
    sheetDateSerial_(date),
    description,
    amount,
    bank,
    'Uncategorized',
    Boolean(transaction.pending),
    'REVIEW',
    '',
    '',
    note
  ];
}

function resolveCutoff_() {
  const cutoff = process.env.SHEETS_START_DATE ||
    new Date(Date.now() - 35 * 86400000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
    throw new Error('SHEETS_START_DATE must be YYYY-MM-DD');
  }
  return cutoff;
}

export function isGoogleSheetsBridgeEnabled() {
  return envTrue_(process.env.SHEETS_BRIDGE_ENABLED);
}

export async function bridgeFirebaseTransactionsToSheets({
  db,
  userId,
  apply = true,
  force = false,
  sheetName = DEFAULT_SHEET_NAME
}) {
  if (!db) throw new Error('bridgeFirebaseTransactionsToSheets requires Firestore db');
  if (!userId) throw new Error('bridgeFirebaseTransactionsToSheets requires userId');

  const configuredUser = String(process.env.SHEETS_USER_ID || '').trim();
  const spreadsheetId = String(process.env.SHEETS_SPREADSHEET_ID || '').trim();

  if (!force && !isGoogleSheetsBridgeEnabled()) {
    return { skipped: true, reason: 'SHEETS_BRIDGE_ENABLED is not true' };
  }
  if (!configuredUser) {
    if (!force) return { skipped: true, reason: 'SHEETS_USER_ID is not configured' };
    throw new Error('Missing SHEETS_USER_ID');
  }
  if (userId !== configuredUser) {
    return { skipped: true, reason: 'Webhook user is not the configured Sheets user' };
  }
  if (!spreadsheetId) {
    if (!force) return { skipped: true, reason: 'SHEETS_SPREADSHEET_ID is not configured' };
    throw new Error('Missing SHEETS_SPREADSHEET_ID');
  }

  const cutoff = resolveCutoff_();
  const serviceAccount = parseServiceAccount_();
  const token = await sheetsToken_(serviceAccount);

  const [sheet, accountMapSheet, settingsDoc, txSnapshot] = await Promise.all([
    sheetsGet_(token, spreadsheetId, `${sheetName}!A:K`),
    sheetsGet_(token, spreadsheetId, 'Account_Map!A:D'),
    db.collection('users').doc(userId).collection('settings').doc('personal').get(),
    db.collection('users').doc(userId).collection('transactions').where('date', '>=', cutoff).get()
  ]);

  const rows = sheet.values || [];
  if (!rows.length || !/transaction.*id/i.test(String(rows[0][0] || ''))) {
    throw new Error(`Unexpected ${sheetName} header; inspect the staging tab before applying`);
  }
  if (
    String(rows[0][6] || '').trim().toLowerCase() !== 'pending' ||
    String(rows[0][7] || '').trim().toLowerCase() !== 'match status'
  ) {
    throw new Error(`Unexpected ${sheetName} columns`);
  }

  const mapRows = accountMapSheet.values || [];
  const bankMap = new Map(
    mapRows.slice(1)
      .filter(row => String(row[3] || '').trim().toUpperCase() === 'TRUE')
      .map(row => [
        String(row[1] || '').trim().toLowerCase(),
        String(row[2] || '').trim()
      ])
      .filter(([institution, bank]) => institution && bank)
  );

  const plaidAccounts = settingsDoc.exists
    ? (settingsDoc.data().plaidAccounts || [])
    : [];

  const accountById = new Map(
    plaidAccounts
      .filter(account => account?.account_id)
      .map(account => [String(account.account_id), account])
  );

  const checkingIds = new Set(
    plaidAccounts
      .filter(account =>
        String(account?.type || '').toLowerCase() === 'depository' &&
        String(account?.subtype || '').toLowerCase() === 'checking' &&
        account?.account_id
      )
      .map(account => String(account.account_id))
  );

  if (!checkingIds.size) {
    throw new Error(
      'No checking accounts found in Firebase settings/personal.plaidAccounts. ' +
      'Bridge stopped rather than exporting non-checking activity.'
    );
  }

  const knownById = new Map();
  rows.slice(1).forEach((row, index) => {
    const id = String(row[0] || '').trim();
    if (id) knownById.set(id, { sheetRow: index + 2, row });
  });

  const staged = [];
  const replacements = [];
  const skipped = {
    manual: 0,
    nonChecking: 0,
    unmappedInstitution: 0,
    invalid: 0,
    existing: 0
  };

  const transactions = txSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => {
      const ad = toIsoDate_(a.authorized_date || a.date);
      const bd = toIsoDate_(b.authorized_date || b.date);
      return ad.localeCompare(bd) ||
        String(a.transaction_id || a.id).localeCompare(String(b.transaction_id || b.id));
    });

  for (const tx of transactions) {
    if (String(tx.source || '').toLowerCase() === 'manual') {
      skipped.manual++;
      continue;
    }

    const transactionId = String(tx.transaction_id || tx.id || '').trim();
    const accountId = String(tx.account_id || '').trim();
    if (!transactionId || !accountId) {
      skipped.invalid++;
      continue;
    }

    if (!checkingIds.has(accountId)) {
      skipped.nonChecking++;
      continue;
    }

    if (knownById.has(transactionId)) {
      skipped.existing++;
      continue;
    }

    const account = accountById.get(accountId) || {
      account_id: accountId,
      name: 'Checking'
    };

    const institution = String(
      tx.institution_name ||
      tx.institutionName ||
      account.institution_name ||
      ''
    ).trim();

    const bank = bankMap.get(institution.toLowerCase());
    if (!bank) {
      skipped.unmappedInstitution++;
      continue;
    }

    try {
      const pendingId = String(tx.pending_transaction_id || '').trim();
      const row = buildRow_(
        { ...tx, transaction_id: transactionId },
        account,
        institution || 'Unknown bank',
        bank
      );

      if (!Boolean(tx.pending) && pendingId && knownById.has(pendingId)) {
        const existing = knownById.get(pendingId);
        replacements.push({
          sheetRow: existing.sheetRow,
          values: row,
          pendingId,
          postedId: transactionId
        });
        knownById.delete(pendingId);
        knownById.set(transactionId, { sheetRow: existing.sheetRow, row });
        continue;
      }

      staged.push(row);
      knownById.set(transactionId, { sheetRow: null, row });
    } catch {
      skipped.invalid++;
    }
  }

  const result = {
    skipped: false,
    mode: apply ? 'apply' : 'preview',
    spreadsheetId,
    since: cutoff,
    firestoreTransactionsScanned: transactions.length,
    totalNew: staged.length,
    totalPostedReplacements: replacements.length,
    skippedCounts: skipped
  };

  if (!apply) return result;

  await formatDateColumn_(token, spreadsheetId, sheetName);

  for (const replacement of replacements) {
    const range = `${sheetName}!A${replacement.sheetRow}:K${replacement.sheetRow}`;
    await sheetsPut_(token, spreadsheetId, range, [replacement.values]);
  }

  if (staged.length) {
    const startRow = Math.max(2, rows.length + 1);
    for (let i = 0; i < staged.length; i += 200) {
      const batch = staged.slice(i, i + 200);
      const batchStart = startRow + i;
      const batchEnd = batchStart + batch.length - 1;
      await sheetsPut_(
        token,
        spreadsheetId,
        `${sheetName}!A${batchStart}:K${batchEnd}`,
        batch
      );
    }
    result.startRow = startRow;
  }

  return result;
}
