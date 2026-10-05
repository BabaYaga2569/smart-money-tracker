import test from "node:test";
import assert from "node:assert/strict";

import { classifyFirebaseHealthError } from "../utils/healthMonitor.js";

test("classifies Firestore RESOURCE_EXHAUSTED as quota limited", () => {
  assert.equal(
    classifyFirebaseHealthError({
      code: 8,
      message: "8 RESOURCE_EXHAUSTED: Quota exceeded."
    }),
    "quota_limited"
  );
});

test("classifies textual quota errors as quota limited", () => {
  assert.equal(
    classifyFirebaseHealthError({
      message: "Quota exceeded for Firestore reads"
    }),
    "quota_limited"
  );
});

test("keeps unrelated Firebase failures unhealthy", () => {
  assert.equal(
    classifyFirebaseHealthError({
      code: 14,
      message: "UNAVAILABLE"
    }),
    "unhealthy"
  );
});
