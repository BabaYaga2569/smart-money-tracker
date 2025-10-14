// backend/server.js
// Smart Money Tracker — Hardened Express server for Render
// - Plaid transactions SYNC with cursor persistence (fixes missing recent txn issue)
// - Firebase Admin via FIREBASE_ADMIN_JSON (no key file on disk)
// - CORS allow-list (Netlify + localhost)
// - Health check + rate limiting
// - Endpoints: /healthz, /api/accounts, /api/plaid/sync_transactions, /api/plaid/force_refresh

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import admin from 'firebase-admin';
import crypto from 'crypto';

// --- Plaid SDK v11+ ---
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

// ---------- Environment ----------
const {
  PORT = 8080,
  NODE_ENV = 'production',

  // Frontend allowed origins
  FRONTEND_ORIGIN, // e.g. https://your-site.netlify.app

  // Plaid
  PLAID_CLIENT_ID,
  PLAID_SECRET,
  PLAID_ENV = 'sandbox', // 'sandbox' | 'development' | 'production'

  // Firebase Admin (full JSON as a single env var string)
  FIREBASE_ADMIN_JSON
} = process.env;

// ---------- App ----------
const app = express();
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// ---------- CORS allow-list ----------
const ALLOWLIST = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  FRONTEND_ORIGIN || '', // Netlify origin, if provided
].filter(Boolean));

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // allow curl / health checks
      if (ALLOWLIST.has(origin)) return cb(null, true);
      return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);

// ---------- Rate limit (basic) ----------
app.use(
  '/api/',
  rateLimit({
    windowMs: 60_000, // 1 minute
    max: 120,         // 120 requests/minute on API routes
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ---------- Firebase Admin init ----------
let adminCreds;
try {
  adminCreds = JSON.parse(FIREBASE_ADMIN_JSON || '{}');
} catch (e) {
  console.error('[FIREBASE] Could not parse FIREBASE_ADMIN_JSON:', e.message);
  adminCreds = {};
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(adminCreds),
  });
}
const db = admin.firestore();

// ---------- Plaid client ----------
const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV] ?? PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
    },
  },
});
const plaid = new PlaidApi(plaidConfig);

// ---------- Helpers (Firestore schema adapters) ----------
// NOTE: This server supports two common schemas out-of-the-box.
// 1) Top-level:  collection('plaid_items').where('userId','==',uid)
// 2) Nested:     collection(`users/${uid}/plaid_items`)
// Adjust if your repo uses different names.

async function getUserPlaidItems(uid) {
  const items = [];

  // Try nested first
  try {
    const snap = await db.collection(`users/${uid}/plaid_items`).get();
    snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
  } catch (_) { /* ignore */ }

  // Fallback: top-level
  if (items.length === 0) {
    const snap = await db.collection('plaid_items').where('userId', '==', uid).get();
    snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
  }

  return items;
}

// Cursor doc path: users/{uid}/plaid_cursors/{item_id}
function cursorDocRef(uid, itemId) {
  return db.doc(`users/${uid}/plaid_cursors/${itemId}`);
}

// Transactions collection: users/{uid}/transactions/{transaction_id}
function txDocRef(uid, txId) {
  return db.doc(`users/${uid}/transactions/${txId}`);
}

// Upsert transactions (added/modified), delete removed.
async function upsertTransactions(uid, added = [], modified = [], removed = []) {
  const batch = db.batch();

  added.forEach((tx) => {
    const ref = txDocRef(uid, tx.transaction_id);
    batch.set(ref, tx, { merge: true });
  });

  modified.forEach((tx) => {
    const ref = txDocRef(uid, tx.transaction_id);
    batch.set(ref, tx, { merge: true });
  });

  removed.forEach((rm) => {
    const ref = txDocRef(uid, rm.transaction_id);
    batch.delete(ref);
  });

  await batch.commit();
}

// Convenience: hash an access_token if needed for debug (never log raw tokens)
function hashToken(t) {
  return !t ? 'no-token' : crypto.createHash('sha256').update(t).digest('hex').slice(0, 10);
}

// ---------- Plaid SYNC core ----------
async function syncItemTransactions({ uid, access_token, item_id }) {
  // Load last cursor for this item
  const cRef = cursorDocRef(uid, item_id);
  const cSnap = await cRef.get();
  let cursor = cSnap.exists ? cSnap.data().cursor : null;

  let added = [];
  let modified = [];
  let removed = [];
  let hasMore = true;
  let loops = 0;

  while (hasMore) {
    loops += 1;
    const res = await plaid.transactionsSync({
      access_token,
      cursor: cursor || null,
    });

    added = added.concat(res.data.added || []);
    modified = modified.concat(res.data.modified || []);
    removed = removed.concat(res.data.removed || []);
    hasMore = !!res.data.has_more;
    cursor = res.data.next_cursor || cursor;

    if (loops > 50) break; // safety
  }

  // Persist new cursor
  await cRef.set({ cursor }, { merge: true });

  return { added, modified, removed, next_cursor: cursor };
}

// ---------- Endpoints ----------

// Health check (Render uses this for health)
app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});

// Get merged balances across all items for a user
// GET /api/accounts?userId=UID
app.get('/api/accounts', async (req, res, next) => {
  try {
    const uid = req.query.userId;
    if (!uid) return res.status(400).json({ error: 'Missing userId' });

    const items = await getUserPlaidItems(uid);
    const all = [];

    for (const item of items) {
      const { access_token } = item;
      if (!access_token) continue;

      const bal = await plaid.accountsBalanceGet({
        access_token,
      });

      // Attach item metadata for frontend mapping if needed
      all.push({
        item_id: item.item_id,
        institution_name: item.institution_name || item.name || 'Bank',
        accounts: bal.data.accounts || [],
      });
    }

    res.json({ accounts: all });
  } catch (err) {
    next(err);
  }
});

// POST /api/plaid/sync_transactions
// body: { userId: "UID" }
// Syncs ALL Plaid items for the user using /transactions/sync
app.post('/api/plaid/sync_transactions', async (req, res, next) => {
  try {
    const { userId: uid } = req.body || {};
    if (!uid) return res.status(400).json({ error: 'Missing userId' });

    const items = await getUserPlaidItems(uid);
    if (!items.length) return res.json({ message: 'No Plaid items for user', summary: [] });

    const summary = [];

    for (const item of items) {
      const { access_token, item_id } = item;
      if (!access_token || !item_id) continue;

      const { added, modified, removed, next_cursor } = await syncItemTransactions({
        uid,
        access_token,
        item_id,
      });

      await upsertTransactions(uid, added, modified, removed);

      summary.push({
        item_id,
        access_token_hash: hashToken(access_token),
        added: added.length,
        modified: modified.length,
        removed: removed.length,
        next_cursor_set: !!next_cursor,
      });
    }

    res.json({
      message: 'Transactions synced successfully',
      summary,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/plaid/force_refresh
// body: { userId: "UID" }
// same as sync_transactions (alias / explicit endpoint for your button)
app.post('/api/plaid/force_refresh', async (req, res, next) => {
  try {
    req.url = '/api/plaid/sync_transactions';
    return app._router.handle(req, res, next);
  } catch (err) {
    next(err);
  }
});

// ---------- Error handler (last) ----------
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err?.message || err);
  if (NODE_ENV !== 'production' && err?.stack) {
    console.error(err.stack);
  }
  res.status(500).json({ error: 'Internal Server Error' });
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`✅ Server listening on :${PORT} [env=${NODE_ENV}]`);
});
