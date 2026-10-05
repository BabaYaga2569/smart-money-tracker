/**
 * Canonical Plaid transaction synchronization engine.
 *
 * All Plaid transaction entry points (manual sync, webhook sync, etc.) should
 * use this module so Firestore receives one consistent transaction schema and
 * Plaid cursors advance only after writes succeed.
 */

const MAX_BATCH_WRITES = 450;
const MAX_PAGINATION_RETRIES = 2;

function toMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(2));
}

export function normalizeMerchantKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function transactionDisplayName(transaction) {
  return transaction?.merchant_name || transaction?.name || "";
}

export function findCompositeDuplicate(plaidTx, existingTransactions, ignoredIds = new Set()) {
  const incomingAmount = toMoney(-plaidTx.amount);
  const incomingName = normalizeMerchantKey(transactionDisplayName(plaidTx));

  return existingTransactions.find(existing => {
    const existingId = existing.transaction_id || existing.id;
    if (!existingId || ignoredIds.has(existingId)) return false;
    if (existingId === plaidTx.transaction_id) return false;

    return existing.date === plaidTx.date &&
      toMoney(existing.amount) === incomingAmount &&
      existing.account_id === plaidTx.account_id &&
      normalizeMerchantKey(transactionDisplayName(existing)) === incomingName;
  }) || null;
}

export function findPendingReplacement(plaidTx, existingTransactions) {
  if (plaidTx.pending) return null;

  if (plaidTx.pending_transaction_id) {
    const linked = existingTransactions.find(existing => {
      const existingId = existing.transaction_id || existing.id;
      return existingId === plaidTx.pending_transaction_id &&
        existing.pending === true &&
        existing.account_id === plaidTx.account_id;
    });

    if (linked) return linked;
  }

  const duplicate = findCompositeDuplicate(plaidTx, existingTransactions);
  return duplicate?.pending === true ? duplicate : null;
}

function stringSimilarity(left, right) {
  const a = normalizeMerchantKey(left);
  const b = normalizeMerchantKey(right);

  if (!a || !b) return 0;
  if (a === b) return 1;

  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  const costs = Array.from({ length: shorter.length + 1 }, (_, index) => index);

  for (let i = 1; i <= longer.length; i++) {
    let previous = costs[0];
    costs[0] = i;

    for (let j = 1; j <= shorter.length; j++) {
      const current = costs[j];
      costs[j] = longer[i - 1] === shorter[j - 1]
        ? previous
        : Math.min(previous, current, costs[j - 1]) + 1;
      previous = current;
    }
  }

  return (longer.length - costs[shorter.length]) / longer.length;
}

export function isManualPendingMatch(manual, plaidTx) {
  if (!manual || plaidTx.pending) return false;

  const accountMatch = manual.account_id === plaidTx.account_id ||
    manual.account === plaidTx.account_id;
  if (!accountMatch) return false;

  if (Math.abs(toMoney(manual.amount) - toMoney(-plaidTx.amount)) >= 0.01) {
    return false;
  }

  const manualDate = new Date(manual.date);
  const plaidDate = new Date(plaidTx.date);
  const daysDiff = Math.abs((manualDate - plaidDate) / 86400000);
  if (!Number.isFinite(daysDiff) || daysDiff > 3) return false;

  const manualName = transactionDisplayName(manual) || manual.description || "";
  const plaidName = transactionDisplayName(plaidTx);
  const normalizedManual = normalizeMerchantKey(manualName);
  const normalizedPlaid = normalizeMerchantKey(plaidName);

  if (!normalizedManual || !normalizedPlaid) return false;

  return normalizedManual === normalizedPlaid ||
    normalizedManual.includes(normalizedPlaid) ||
    normalizedPlaid.includes(normalizedManual) ||
    (normalizedManual.length > 5 &&
      normalizedPlaid.length > 5 &&
      normalizedManual.slice(0, 5) === normalizedPlaid.slice(0, 5)) ||
    stringSimilarity(normalizedManual, normalizedPlaid) > 0.6;
}

function manualOverrides(transaction) {
  if (!transaction?.manuallyEdited) return {};

  const fields = [
    "amount",
    "date",
    "name",
    "merchant_name",
    "category",
    "notes",
    "description",
    "manuallyEdited"
  ];

  return Object.fromEntries(
    fields
      .filter(field => transaction[field] !== undefined)
      .map(field => [field, transaction[field]])
  );
}

async function fetchPlaidChanges({ plaidClient, item }) {
  const startingCursor = item.cursor || null;

  for (let attempt = 0; attempt <= MAX_PAGINATION_RETRIES; attempt++) {
    let cursor = startingCursor;
    let hasMore = true;
    const added = [];
    const modified = [];
    const removed = [];
    const accounts = new Map();

    try {
      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: item.accessToken,
          cursor: cursor || undefined,
          options: {
            include_personal_finance_category: true
          }
        });

        for (const account of response.data.accounts || []) {
          accounts.set(account.account_id, account);
        }

        added.push(...(response.data.added || []));
        modified.push(...(response.data.modified || []));
        removed.push(...(response.data.removed || []));

        cursor = response.data.next_cursor || cursor;
        hasMore = Boolean(response.data.has_more);
      }

      return {
        startingCursor,
        nextCursor: cursor,
        added,
        modified,
        removed,
        accounts
      };
    } catch (error) {
      const code = error?.response?.data?.error_code;
      const mutationDuringPagination =
        code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";

      if (!mutationDuringPagination || attempt === MAX_PAGINATION_RETRIES) {
        throw error;
      }
    }
  }

  throw new Error("Plaid pagination retry limit exceeded");
}

async function commitOperationGroups(db, operationGroups) {
  let batch = db.batch();
  let batchWrites = 0;
  let committedWrites = 0;

  const commitCurrentBatch = async () => {
    if (batchWrites === 0) return;
    await batch.commit();
    committedWrites += batchWrites;
    batch = db.batch();
    batchWrites = 0;
  };

  for (const group of operationGroups) {
    if (group.length > MAX_BATCH_WRITES) {
      throw new Error("A Plaid reconciliation group exceeded the Firestore batch limit");
    }

    if (batchWrites + group.length > MAX_BATCH_WRITES) {
      await commitCurrentBatch();
    }

    for (const operation of group) {
      if (operation.type === "delete") {
        batch.delete(operation.ref);
      } else {
        batch.set(operation.ref, operation.data, { merge: true });
      }
      batchWrites++;
    }
  }

  await commitCurrentBatch();
  return committedWrites;
}

async function getTransactionsByIds(db, transactionsRef, ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const results = [];
  const CHUNK_SIZE = 100;

  for (let index = 0; index < uniqueIds.length; index += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(index, index + CHUNK_SIZE);
    const refs = chunk.map(id => transactionsRef.doc(id));
    const snapshots = await db.getAll(...refs);

    for (const snapshot of snapshots) {
      if (snapshot.exists) {
        results.push({
          id: snapshot.id,
          ...snapshot.data()
        });
      }
    }
  }

  return results;
}

function mergeTransactionSets(...groups) {
  const byId = new Map();

  for (const group of groups) {
    for (const transaction of group || []) {
      const id = transaction?.transaction_id || transaction?.id;
      if (!id) continue;
      byId.set(id, transaction);
    }
  }

  return [...byId.values()];
}

async function loadRelevantExistingTransactions({
  db,
  transactionsRef,
  incomingTransactions,
  removedTransactions
}) {
  const directIds = [];

  for (const transaction of incomingTransactions) {
    if (transaction?.transaction_id) directIds.push(transaction.transaction_id);
    if (transaction?.pending_transaction_id) directIds.push(transaction.pending_transaction_id);
  }

  for (const transaction of removedTransactions) {
    if (transaction?.transaction_id) directIds.push(transaction.transaction_id);
  }

  const directMatches = await getTransactionsByIds(db, transactionsRef, directIds);

  let pendingMatches = [];
  if (incomingTransactions.some(transaction => !transaction?.pending)) {
    const pendingSnapshot = await transactionsRef
      .where("pending", "==", true)
      .get();

    pendingMatches = pendingSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  }

  return {
    transactions: mergeTransactionSets(directMatches, pendingMatches),
    readCount: directMatches.length + pendingMatches.length,
    requestedDirectIds: [...new Set(directIds)].length,
    pendingReadCount: pendingMatches.length
  };
}

async function advanceCursorSafely({ db, itemRef, startingCursor, nextCursor, admin, trigger }) {
  if (!nextCursor) return false;

  let advanced = false;

  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(itemRef);
    const storedCursor = snapshot.exists ? snapshot.data()?.cursor || null : null;

    // A concurrent sync already advanced this item. Never move the cursor backward.
    if (storedCursor !== startingCursor && storedCursor !== nextCursor) {
      return;
    }

    transaction.set(itemRef, {
      cursor: nextCursor,
      lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSyncTrigger: trigger
    }, { merge: true });

    advanced = true;
  });

  return advanced;
}

export async function findPlaidItemDocument(db, itemId) {
  if (!itemId) return null;

  const usersSnapshot = await db.collection("users").get();

  for (const userDoc of usersSnapshot.docs) {
    const plaidItems = userDoc.ref.collection("plaid_items");

    // Newer connections normally use itemId as the Firestore document ID.
    const direct = await plaidItems.doc(itemId).get();
    if (direct.exists) return direct;

    // Older connections can have a different document ID while storing itemId
    // as a field. Query inside each user's subcollection so no collection-group
    // index is required.
    const byCamelCase = await plaidItems.where("itemId", "==", itemId).limit(1).get();
    if (!byCamelCase.empty) return byCamelCase.docs[0];

    const bySnakeCase = await plaidItems.where("item_id", "==", itemId).limit(1).get();
    if (!bySnakeCase.empty) return bySnakeCase.docs[0];
  }

  return null;
}

export async function syncPlaidItemTransactions({
  db,
  admin,
  plaidClient,
  userId,
  item,
  trigger = "manual",
  autoCategorize = () => "",
  logDiagnostic = null
}) {
  if (!userId) throw new Error("userId is required");
  if (!item?.accessToken) throw new Error("Plaid access token is missing");
  if (!item?.itemId) throw new Error("Plaid itemId is missing");

  const transactionsRef = db.collection("users").doc(userId).collection("transactions");
  const changes = await fetchPlaidChanges({ plaidClient, item });
  const incomingTransactions = [...changes.added, ...changes.modified];

  // Cursor-based Plaid sync normally returns only a handful of changes. Do not
  // read the user's entire transaction history for every bank item. Fetch only
  // exact transaction IDs involved in this change set plus currently pending
  // rows needed for pending -> posted reconciliation.
  const existingLoad = await loadRelevantExistingTransactions({
    db,
    transactionsRef,
    incomingTransactions,
    removedTransactions: changes.removed
  });

  const existingTransactions = existingLoad.transactions;
  const existingById = new Map(
    existingTransactions.map(transaction => [
      transaction.transaction_id || transaction.id,
      transaction
    ])
  );

  const manualPendingCharges = existingTransactions.filter(transaction =>
    transaction.source === "manual" && transaction.pending === true
  );
  const incomingIds = new Set(incomingTransactions.map(tx => tx.transaction_id));
  const plannedDeleteIds = new Set();
  const processedIncomingIds = new Set();
  const operationGroups = [];

  let added = 0;
  let updated = 0;
  let pending = 0;
  let removed = 0;
  let deduplicated = 0;
  let skipped = 0;
  let pendingReplaced = 0;

  for (const plaidTx of incomingTransactions) {
    if (!plaidTx?.transaction_id || processedIncomingIds.has(plaidTx.transaction_id)) {
      skipped++;
      continue;
    }
    processedIncomingIds.add(plaidTx.transaction_id);

    const currentExisting = existingById.get(plaidTx.transaction_id) || null;
    const pendingReplacement = findPendingReplacement(plaidTx, existingTransactions);

    // Do not discard a posted transaction solely because another posted
    // transaction has the same date/merchant/amount. Two legitimate purchases
    // can be identical. Composite matching is used only as a fallback for
    // pending -> posted replacement.
    const group = [];
    const predecessor = pendingReplacement;

    if (predecessor) {
      const predecessorId = predecessor.transaction_id || predecessor.id;
      if (predecessorId &&
          predecessorId !== plaidTx.transaction_id &&
          !plannedDeleteIds.has(predecessorId)) {
        group.push({
          type: "delete",
          ref: transactionsRef.doc(predecessorId)
        });
        plannedDeleteIds.add(predecessorId);
        pendingReplaced++;
      }
    }

    if (!plaidTx.pending) {
      const matchingManualCharge = manualPendingCharges.find(manual =>
        !plannedDeleteIds.has(manual.id) && isManualPendingMatch(manual, plaidTx)
      );

      if (matchingManualCharge) {
        group.push({
          type: "delete",
          ref: transactionsRef.doc(matchingManualCharge.id)
        });
        plannedDeleteIds.add(matchingManualCharge.id);
        deduplicated++;
      }
    }

    const account = changes.accounts.get(plaidTx.account_id);
    const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
    const predecessorOverrides = manualOverrides(predecessor);
    const currentOverrides = manualOverrides(currentExisting);
    const preservedTimestamp =
      currentExisting?.timestamp ||
      predecessor?.timestamp ||
      serverTimestamp;
    const preservedCreatedAt =
      currentExisting?.createdAt ||
      predecessor?.createdAt ||
      preservedTimestamp;

    const transactionData = {
      transaction_id: plaidTx.transaction_id,
      pending_transaction_id: plaidTx.pending_transaction_id || null,
      account_id: plaidTx.account_id,
      item_id: item.itemId,
      amount: toMoney(-plaidTx.amount),
      date: plaidTx.date,
      name: plaidTx.name || plaidTx.merchant_name || "Unknown transaction",
      merchant_name: plaidTx.merchant_name || plaidTx.name || "Unknown transaction",
      category: autoCategorize(plaidTx.merchant_name || plaidTx.name),
      pending: Boolean(plaidTx.pending),
      payment_channel: plaidTx.payment_channel || "other",
      source: "plaid",
      mask: account?.mask || currentExisting?.mask || predecessor?.mask || null,
      institution_name: item.institutionName || currentExisting?.institution_name || null,
      institutionName: item.institutionName || currentExisting?.institutionName || null,
      personal_finance_category: plaidTx.personal_finance_category || null,
      original_category: plaidTx.category || null,
      timestamp: preservedTimestamp,
      createdAt: preservedCreatedAt,
      updatedAt: serverTimestamp,
      lastSyncedAt: serverTimestamp,
      synced_at: serverTimestamp,
      lastSyncTrigger: trigger,
      ...predecessorOverrides,
      ...currentOverrides
    };

    // Never allow manual overrides to change Plaid identity/state fields.
    transactionData.transaction_id = plaidTx.transaction_id;
    transactionData.pending_transaction_id = plaidTx.pending_transaction_id || null;
    transactionData.account_id = plaidTx.account_id;
    transactionData.item_id = item.itemId;
    transactionData.pending = Boolean(plaidTx.pending);
    transactionData.source = "plaid";
    transactionData.lastSyncTrigger = trigger;
    transactionData.updatedAt = serverTimestamp;
    transactionData.lastSyncedAt = serverTimestamp;
    transactionData.synced_at = serverTimestamp;

    group.push({
      type: "set",
      ref: transactionsRef.doc(plaidTx.transaction_id),
      data: transactionData
    });

    operationGroups.push(group);

    if (plaidTx.pending) pending++;
    if (currentExisting) updated++;
    else added++;
  }

  for (const removedTx of changes.removed) {
    const removedId = removedTx?.transaction_id;
    if (!removedId ||
        incomingIds.has(removedId) ||
        plannedDeleteIds.has(removedId)) {
      continue;
    }

    const existing = existingById.get(removedId);
    if (!existing) continue;

    const belongsToPlaid =
      existing.source === "plaid" ||
      existing.item_id === item.itemId;

    if (!belongsToPlaid) continue;

    operationGroups.push([{
      type: "delete",
      ref: transactionsRef.doc(removedId)
    }]);
    plannedDeleteIds.add(removedId);
    removed++;
  }

  const committedWrites = await commitOperationGroups(db, operationGroups);

  const itemRef = db.collection("users")
    .doc(userId)
    .collection("plaid_items")
    .doc(item.documentId || item.itemId);

  const cursorAdvanced = await advanceCursorSafely({
    db,
    itemRef,
    startingCursor: changes.startingCursor,
    nextCursor: changes.nextCursor,
    admin,
    trigger
  });

  logDiagnostic?.info?.("PLAID_SYNC_ENGINE", "Plaid item reconciliation complete", {
    trigger,
    added,
    updated,
    pending,
    removed,
    deduplicated,
    pending_replaced: pendingReplaced,
    skipped,
    committed_writes: committedWrites,
    cursor_advanced: cursorAdvanced,
    reconciliation_documents_read: existingLoad.readCount,
    direct_ids_requested: existingLoad.requestedDirectIds,
    pending_documents_read: existingLoad.pendingReadCount
  });

  return {
    added,
    updated,
    pending,
    removed,
    deduplicated,
    pendingReplaced,
    skipped,
    committedWrites,
    cursorAdvanced,
    nextCursor: changes.nextCursor,
    reconciliationReadCount: existingLoad.readCount
  };
}
