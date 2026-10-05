import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCOUNT_VISIBILITY_SCHEMA_VERSION,
  calculateVisibleDepositoryTotal,
  isAccountVisible,
  normalizePlaidAccount,
  reconcileAccountRegistry
} from "../utils/accountRegistry.js";

test("credit cards use current balance owed as canonical balance", () => {
  const normalized = normalizePlaidAccount({
    account_id: "cc-1",
    type: "credit",
    subtype: "credit card",
    balances: {
      current: 650.25,
      available: 4350.75,
      limit: 5000
    }
  });

  assert.equal(normalized.balance, 650.25);
  assert.equal(normalized.current_balance, 650.25);
  assert.equal(normalized.available_balance, 4350.75);
});

test("depository accounts use available balance when present", () => {
  const normalized = normalizePlaidAccount({
    account_id: "checking-1",
    type: "depository",
    subtype: "checking",
    balances: {
      current: 1000,
      available: 925.55
    }
  });

  assert.equal(normalized.balance, 925.55);
});

test("legacy migration keeps previously visible accounts visible and marks missing Plaid accounts hidden", () => {
  const result = reconcileAccountRegistry({
    existingAccounts: [
      {
        account_id: "checking-1",
        item_id: "item-a",
        mask: "1111",
        institution_name: "Example Bank",
        type: "depository",
        subtype: "checking",
        balance: 100
      }
    ],
    freshAccounts: [
      {
        account_id: "checking-1",
        item_id: "item-a",
        mask: "1111",
        institution_name: "Example Bank",
        type: "depository",
        subtype: "checking",
        balances: { current: 100, available: 100 }
      },
      {
        account_id: "savings-1",
        item_id: "item-a",
        mask: "2222",
        institution_name: "Example Bank",
        type: "depository",
        subtype: "savings",
        balances: { current: 500, available: 500 }
      }
    ],
    preferences: {},
    visibilitySchemaVersion: 0,
    completeSnapshot: true
  });

  assert.equal(result.visibilitySchemaVersion, ACCOUNT_VISIBILITY_SCHEMA_VERSION);
  assert.equal(result.accounts.length, 2);
  assert.equal(result.preferences["checking-1"].visible, true);
  assert.equal(result.preferences["savings-1"].visible, false);
});

test("new accounts default visible after migration", () => {
  const result = reconcileAccountRegistry({
    existingAccounts: [
      {
        account_id: "checking-1",
        item_id: "item-a",
        mask: "1111",
        institution_name: "Example Bank"
      }
    ],
    freshAccounts: [
      {
        account_id: "checking-1",
        item_id: "item-a",
        mask: "1111",
        institution_name: "Example Bank",
        balances: { current: 100, available: 100 }
      },
      {
        account_id: "new-1",
        item_id: "item-b",
        mask: "3333",
        institution_name: "New Bank",
        balances: { current: 50, available: 50 }
      }
    ],
    preferences: {
      "checking-1": { visible: true }
    },
    visibilitySchemaVersion: ACCOUNT_VISIBILITY_SCHEMA_VERSION,
    completeSnapshot: true
  });

  assert.equal(result.preferences["new-1"].visible, true);
});

test("visibility preference follows an account id change after reconnection", () => {
  const result = reconcileAccountRegistry({
    existingAccounts: [
      {
        account_id: "old-id",
        item_id: "old-item",
        mask: "4444",
        institution_name: "Example Bank",
        balance: 123
      }
    ],
    freshAccounts: [
      {
        account_id: "new-id",
        item_id: "new-item",
        mask: "4444",
        institution_name: "Example Bank",
        balances: { current: 123, available: 123 }
      }
    ],
    preferences: {
      "old-id": { visible: false }
    },
    visibilitySchemaVersion: ACCOUNT_VISIBILITY_SCHEMA_VERSION,
    completeSnapshot: true
  });

  assert.equal(result.preferences["new-id"].visible, false);
  assert.equal(result.preferences["old-id"], undefined);
  assert.equal(isAccountVisible(result.accounts[0], result.preferences), false);
});

test("visible depository total excludes hidden accounts and credit card debt", () => {
  const accounts = [
    { account_id: "checking", type: "depository", subtype: "checking", balance: 1000 },
    { account_id: "savings", type: "depository", subtype: "savings", balance: 500 },
    { account_id: "credit", type: "credit", subtype: "credit card", balance: 200 }
  ];

  const preferences = {
    checking: { visible: true },
    savings: { visible: false },
    credit: { visible: true }
  };

  assert.equal(calculateVisibleDepositoryTotal(accounts, preferences), 1000);
});
