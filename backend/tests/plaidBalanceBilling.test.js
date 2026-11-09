import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Prevent reintroducing paid Balance API calls on automatic code paths.
test("Plaid balance queries use the free cached accounts endpoint", () => {
  const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /plaidClient\.accountsBalanceGet\s*\(/);
  assert.match(source, /plaidClient\.accountsGet\s*\(/);
});

test("Accounts page no longer polls paid balances", () => {
  const source = readFileSync(new URL("../../frontend/src/pages/Accounts.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /useSmartBalanceSync\s*\(/);
  assert.doesNotMatch(source, /refresh=true/);
  assert.match(source, /\/api\/plaid\/sync_transactions/);
});
