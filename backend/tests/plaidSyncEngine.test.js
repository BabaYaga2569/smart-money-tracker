import test from "node:test";
import assert from "node:assert/strict";

import {
  collectRelevantTransactionIds,
  findCompositeDuplicate,
  findPendingReplacement,
  isManualPendingMatch
} from "../utils/plaidSyncEngine.js";

test("linked pending transaction is replaced by posted transaction", () => {
  const existing = [{
    id: "pending-old",
    transaction_id: "pending-old",
    account_id: "acct-1",
    amount: -28.15,
    date: "2026-10-04",
    merchant_name: "Walmart",
    pending: true,
    source: "plaid"
  }];

  const posted = {
    transaction_id: "posted-new",
    pending_transaction_id: "pending-old",
    account_id: "acct-1",
    amount: 28.15,
    date: "2026-10-04",
    merchant_name: "Walmart",
    pending: false
  };

  assert.equal(findPendingReplacement(posted, existing)?.transaction_id, "pending-old");
});

test("unlinked posted transaction can replace an exact pending composite match", () => {
  const existing = [{
    id: "pending-old",
    transaction_id: "pending-old",
    account_id: "acct-1",
    amount: -34.08,
    date: "2026-10-04",
    merchant_name: "Subway",
    pending: true,
    source: "plaid"
  }];

  const posted = {
    transaction_id: "posted-new",
    account_id: "acct-1",
    amount: 34.08,
    date: "2026-10-04",
    merchant_name: "SUBWAY",
    pending: false
  };

  assert.equal(findPendingReplacement(posted, existing)?.transaction_id, "pending-old");
});

test("already-posted composite duplicate is detected instead of treated as pending replacement", () => {
  const existing = [{
    id: "posted-old",
    transaction_id: "posted-old",
    account_id: "acct-1",
    amount: -60.25,
    date: "2026-10-04",
    merchant_name: "Amazon",
    pending: false,
    source: "plaid"
  }];

  const incoming = {
    transaction_id: "posted-new",
    account_id: "acct-1",
    amount: 60.25,
    date: "2026-10-04",
    merchant_name: "Amazon",
    pending: false
  };

  assert.equal(findPendingReplacement(incoming, existing), null);
  assert.equal(findCompositeDuplicate(incoming, existing)?.transaction_id, "posted-old");
});

test("manual pending charge matches a posted Plaid transaction within date tolerance", () => {
  const manual = {
    id: "manual-1",
    account_id: "acct-1",
    amount: -52.43,
    date: "2026-10-02",
    merchant_name: "Walmart Supercenter",
    pending: true,
    source: "manual"
  };

  const posted = {
    transaction_id: "plaid-1",
    account_id: "acct-1",
    amount: 52.43,
    date: "2026-10-04",
    merchant_name: "Walmart",
    pending: false
  };

  assert.equal(isManualPendingMatch(manual, posted), true);
});

test("manual pending charge does not match a different account", () => {
  const manual = {
    id: "manual-1",
    account_id: "acct-1",
    amount: -52.43,
    date: "2026-10-04",
    merchant_name: "Walmart",
    pending: true,
    source: "manual"
  };

  const posted = {
    transaction_id: "plaid-1",
    account_id: "acct-2",
    amount: 52.43,
    date: "2026-10-04",
    merchant_name: "Walmart",
    pending: false
  };

  assert.equal(isManualPendingMatch(manual, posted), false);
});


test("reconciliation planner reads only changed, predecessor, and removed transaction ids", () => {
  const ids = collectRelevantTransactionIds(
    [
      {
        transaction_id: "posted-1",
        pending_transaction_id: "pending-1"
      },
      {
        transaction_id: "posted-2",
        pending_transaction_id: "pending-1"
      }
    ],
    [
      { transaction_id: "removed-1" }
    ]
  );

  assert.deepEqual(
    ids.sort(),
    ["pending-1", "posted-1", "posted-2", "removed-1"].sort()
  );
});

test("reconciliation planner performs no transaction document reads when Plaid returns no changes", () => {
  assert.deepEqual(collectRelevantTransactionIds([], []), []);
});
