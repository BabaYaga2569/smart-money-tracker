import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeBillStores,
  normalizeDate,
  hasTransactionEvidence
} from "../utils/billDoctor.js";

test("detects a linked transaction that still leaves a bill unpaid", () => {
  const report = analyzeBillStores({
    recurringPatterns: [
      {
        id: "pattern-1",
        name: "Phone",
        amount: 100,
        frequency: "monthly",
        status: "active",
        type: "expense"
      }
    ],
    financialEvents: [
      {
        id: "bill-1",
        type: "bill",
        name: "Phone",
        amount: 100,
        dueDate: "2026-09-21",
        isPaid: false,
        status: "overdue",
        recurringPatternId: "pattern-1",
        linkedTransactionId: "txn-1"
      }
    ]
  }, new Date("2026-10-05T12:00:00Z"));

  const issue = report.issues.find(item => item.code === "LINKED_BUT_UNPAID");
  assert.ok(issue);
  assert.equal(issue.count, 1);
  assert.equal(report.canonical.financialEvents.overdueBills, 1);
});

test("detects paid-state conflicts", () => {
  const report = analyzeBillStores({
    financialEvents: [
      {
        id: "bill-1",
        type: "bill",
        name: "Internet",
        amount: 80,
        dueDate: "2026-10-01",
        isPaid: true,
        status: "overdue"
      }
    ]
  }, new Date("2026-10-05T12:00:00Z"));

  assert.equal(
    report.issues.some(item => item.code === "PAID_STATE_CONFLICT"),
    true
  );
});

test("detects duplicate occurrences by name amount and due date", () => {
  const report = analyzeBillStores({
    financialEvents: [
      {
        id: "bill-1",
        type: "bill",
        name: "Rent",
        amount: 350,
        dueDate: "2026-10-15",
        isPaid: false,
        status: "pending"
      },
      {
        id: "bill-2",
        type: "bill",
        name: "RENT",
        amount: 350,
        dueDate: "2026-10-15",
        isPaid: false,
        status: "pending"
      }
    ]
  }, new Date("2026-10-05T12:00:00Z"));

  const issue = report.issues.find(item => item.code === "DUPLICATE_OCCURRENCES");
  assert.ok(issue);
  assert.equal(issue.count, 2);
});

test("does not treat split rent on different due dates as a duplicate", () => {
  const report = analyzeBillStores({
    financialEvents: [
      {
        id: "bill-1",
        type: "bill",
        name: "Rent",
        amount: 350,
        dueDate: "2026-10-15",
        isPaid: false
      },
      {
        id: "bill-2",
        type: "bill",
        name: "Rent",
        amount: 350,
        dueDate: "2026-10-30",
        isPaid: false
      }
    ]
  }, new Date("2026-10-05T12:00:00Z"));

  assert.equal(
    report.issues.some(item => item.code === "DUPLICATE_OCCURRENCES"),
    false
  );
});

test("detects orphan recurring pattern links and legacy population", () => {
  const report = analyzeBillStores({
    recurringPatterns: [],
    financialEvents: [
      {
        id: "bill-1",
        type: "bill",
        name: "Water",
        amount: 25,
        dueDate: "2026-10-08",
        recurringPatternId: "missing-pattern",
        isPaid: false
      }
    ],
    billInstances: [{ id: "legacy-bill" }],
    settingsBills: [{ name: "Legacy Bill" }]
  }, new Date("2026-10-05T12:00:00Z"));

  assert.equal(
    report.issues.some(item => item.code === "ORPHAN_PATTERN_LINKS"),
    true
  );
  assert.equal(report.legacy.totalLegacyRecords, 2);
});

test("normalizes Firestore-like dates and payment evidence", () => {
  const fakeTimestamp = {
    toDate: () => new Date("2026-10-05T10:00:00Z")
  };

  assert.equal(normalizeDate(fakeTimestamp), "2026-10-05");
  assert.equal(hasTransactionEvidence({ linkedTransactionIds: ["txn-1"] }), true);
  assert.equal(hasTransactionEvidence({}), false);
});
