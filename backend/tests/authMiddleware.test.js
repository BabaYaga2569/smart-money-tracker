import test from "node:test";
import assert from "node:assert/strict";

import {
  isAuthExemptPath,
  requestedUserId
} from "../middleware/authMiddleware.js";

test("Sheets refresh and Plaid webhook are exempt from Firebase user auth", () => {
  assert.equal(isAuthExemptPath("/api/plaid/sheets_force_refresh"), true);
  assert.equal(isAuthExemptPath("/api/plaid/webhook"), true);
  assert.equal(isAuthExemptPath("/api/accounts"), false);
});

test("request userId prefers JSON body over query string for mismatch detection", () => {
  const req = {
    body: { userId: "body-user" },
    query: { userId: "query-user" }
  };

  assert.equal(requestedUserId(req), "body-user");
});

test("request userId falls back to query string", () => {
  const req = {
    body: {},
    query: { userId: "query-user" }
  };

  assert.equal(requestedUserId(req), "query-user");
});
