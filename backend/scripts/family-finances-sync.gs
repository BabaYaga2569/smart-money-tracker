/**
 * Family Finances Sheet Sync - Phase 1 incremental
 *
 * TEST workbook only.
 *
 * A transaction is eligible only when Plaid has just imported/replaced it:
 * - Match Status = REVIEW
 * - Notes still contain "imported for review"
 * - Notes do not yet contain "Family Finances sync:"
 *
 * For each fresh item:
 * - pending bank items are marked and left alone until Plaid posts/replaces them
 * - verified non-mixed matches can update ONLY monthly Column D
 * - safe, confidently categorized posted purchases can auto-insert
 * - ambiguous merchants/categories are queued once in Plaid_Review
 *
 * This prevents the 15-minute job from re-processing the historical backlog.
 */

const FAMILY_FINANCES_TEST_SHEET_ID = '1qaaf0t9il726oQpL2oXMbZqlF7zJpHomsClk8vklE_g';
const FAMILY_FINANCES_SYNC_MARKER = 'Family Finances sync:';
const FAMILY_FINANCES_SYNC_BUTTON_SHEET = 'Safe to Spend';
const FAMILY_FINANCES_SYNC_BUTTON_CELL = 'C34';
const FAMILY_FINANCES_REFRESH_BUTTON_CELL = 'C35';
const FAMILY_FINANCES_REFRESH_ENDPOINT = 'https://smart-money-tracker-09ks.onrender.com/api/plaid/sheets_force_refresh';

function familyFinancesSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active && active.getId() === FAMILY_FINANCES_TEST_SHEET_ID) return active;
  return SpreadsheetApp.openById(FAMILY_FINANCES_TEST_SHEET_ID);
}

function familyFinancesSetting_(settingName, fallbackValue) {
  const ss = familyFinancesSpreadsheet_();
  const sheet = ss.getSheetByName('Plaid_Settings');
  if (!sheet || sheet.getLastRow() < 2) return fallbackValue;

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();

  for (const row of rows) {
    const name = row[0];
    const value = row[1];

    if (String(name || '').trim().toLowerCase() !== String(settingName).trim().toLowerCase()) {
      continue;
    }

    if (typeof value === 'boolean') return value;

    const text = String(value || '').trim().toUpperCase();
    if (text === 'TRUE') return true;
    if (text === 'FALSE') return false;

    return value;
  }

  return fallbackValue;
}

function familyFinancesMonthTabName_(date) {
  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  const monthNum = String(monthIndex + 1).padStart(2, '0');
  const monthName = Utilities.formatDate(
    new Date(year, monthIndex, 1),
    Session.getScriptTimeZone(),
    'MMMM'
  );
  return monthNum + '-' + monthName + ' ' + year;
}

function familyFinancesNorm_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function familyFinancesIsPending_(value) {
  return value === true || String(value || '').trim().toUpperCase() === 'TRUE';
}

function familyFinancesIsFreshImport_(row) {
  const id = String(row[0] || '').trim();
  const status = String(row[7] || '').trim().toUpperCase();
  const pending = familyFinancesIsPending_(row[6]);
  const notes = String(row[10] || '');
  const lowerNotes = notes.toLowerCase();

  if (!id || status !== 'REVIEW' || !lowerNotes.includes('imported for review')) {
    return false;
  }

  // Normal new import: Family Finances has not touched it yet.
  if (!lowerNotes.includes(FAMILY_FINANCES_SYNC_MARKER.toLowerCase())) {
    return true;
  }

  // One-time recovery for pending rows processed by the older logic.
  // Those rows were marked "wait for posting" but never placed into Column C.
  // Reprocess them once so pending activity immediately affects the forecast.
  return pending &&
    (
      lowerNotes.includes('pending bank item; wait for posting') ||
      lowerNotes.includes('pending bank item could not be added to forecast')
    ) &&
    !lowerNotes.includes('added to monthly forecast column c') &&
    !lowerNotes.includes('already represented in monthly forecast column c');
}

function familyFinancesIsMixedMerchant_(merchant) {
  const name = familyFinancesNorm_(merchant);
  const mixed = [
    'walmart',
    'wal mart',
    'target',
    'amazon',
    'costco',
    'sam s club',
    'sams club',
    'zelle',
    'apple pay'
  ];

  return mixed.some(function(term) {
    return name.includes(term);
  });
}

function familyFinancesIsAutoInsertCategory_(category) {
  const normalized = String(category || '').trim().toLowerCase();

  // Only ordinary posted purchases/services are eligible for unattended insert.
  // Transfers, income, credit-card payments, rent/car payments, refunds and
  // anything uncategorized stay in review because they can change accounting
  // semantics or duplicate a planned obligation.
  const allowed = new Set([
    'utilities',
    'groceries',
    'gas for cars',
    'subscriptions',
    'dining',
    'shopping',
    'health/medical',
    'home/garden',
    'bills/other',
    'fees',
    'entertainment'
  ]);

  return allowed.has(normalized);
}

function familyFinancesShouldAutoInsert_(
  merchant,
  category,
  amount,
  monthSheet,
  matchResults
) {
  if (!monthSheet) return false;
  if (!Number.isFinite(Number(amount)) || Number(amount) >= 0) return false;
  if (familyFinancesIsMixedMerchant_(merchant)) return false;
  if (!familyFinancesIsAutoInsertCategory_(category)) return false;

  const results = matchResults || [];
  if (results.some(function(result) {
    return result && result.status && result.status !== 'NONE';
  })) {
    return false;
  }

  return true;
}

function familyFinancesMerchantCoreTokens_(value) {
  const ignored = new Set([
    'a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'the', 'to',
    'service', 'services', 'subscription', 'payment', 'payments', 'paymt',
    'online', 'purchase', 'purchases', 'pos', 'debit', 'credit', 'card',
    'checking', 'banking', 'inc', 'llc', 'company', 'co'
  ]);

  return familyFinancesNorm_(value)
    .split(' ')
    .filter(function(token) {
      return token && token.length >= 2 && !ignored.has(token);
    });
}

function familyFinancesMerchantLooksSame_(left, right) {
  const a = familyFinancesNorm_(left);
  const b = familyFinancesNorm_(right);

  if (!a || !b) return false;
  if (a === b) return true;

  if ((a.length >= 8 && b.includes(a)) || (b.length >= 8 && a.includes(b))) {
    return true;
  }

  const aTokens = familyFinancesMerchantCoreTokens_(a);
  const bTokens = familyFinancesMerchantCoreTokens_(b);

  if (!aTokens.length || !bTokens.length) return false;

  const bSet = new Set(bTokens);
  const shared = aTokens.filter(function(token) {
    return bSet.has(token);
  });

  if (shared.length < 2) return false;

  const shorter = Math.min(aTokens.length, bTokens.length);
  return shorter > 0 && (shared.length / shorter) >= 0.67;
}

function familyFinancesFindAlreadyEnteredCandidate_(monthSheet, merchant, amount, bank) {
  if (!monthSheet || monthSheet.getLastRow() < 2) {
    return { status: 'NONE', candidates: [] };
  }

  const rows = monthSheet.getRange(2, 1, monthSheet.getLastRow() - 1, 6).getValues();
  const candidates = [];
  const wantedBank = familyFinancesNorm_(bank);

  rows.forEach(function(row, index) {
    const rowMerchant = row[1];
    const rowActual = row[3];
    const rowBank = row[4];

    if (!rowMerchant || rowActual === '' || rowActual === null) return;
    if (familyFinancesNorm_(rowBank) !== wantedBank) return;
    if (!Number.isFinite(Number(rowActual))) return;
    if (Math.abs(Number(rowActual) - Number(amount)) > 0.005) return;
    if (!familyFinancesMerchantLooksSame_(merchant, rowMerchant)) return;

    candidates.push({
      rowNumber: index + 2,
      values: row
    });
  });

  if (candidates.length === 0) return { status: 'NONE', candidates: candidates };
  if (candidates.length > 1) return { status: 'MULTIPLE', candidates: candidates };

  return { status: 'ONE', candidates: candidates };
}

function familyFinancesFindExactBankAmountDateCandidate_(monthSheet, txDate, amount, bank) {
  if (!monthSheet || monthSheet.getLastRow() < 2) {
    return { status: 'NONE', candidates: [] };
  }

  const rows = monthSheet.getRange(2, 1, monthSheet.getLastRow() - 1, 6).getValues();
  const candidates = [];
  const wantedBank = familyFinancesNorm_(bank);

  rows.forEach(function(row, index) {
    const rowDate = row[0];
    const rowActual = row[3];
    const rowBank = row[4];

    if (!(rowDate instanceof Date) || isNaN(rowDate.getTime())) return;
    if (rowActual === '' || rowActual === null || !Number.isFinite(Number(rowActual))) return;
    if (familyFinancesNorm_(rowBank) !== wantedBank) return;
    if (!familyFinancesAmountsEqual_(rowActual, amount)) return;

    const dayDifference = Math.abs(
      (rowDate.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Banks commonly post one or more days after the user entered the purchase.
    // Exact bank + exact cleared amount + a tight date window is strong enough
    // to recognize an already-entered row even when the merchant/memo wording
    // is completely different. If more than one row qualifies, never guess.
    if (dayDifference > 4) return;

    candidates.push({
      rowNumber: index + 2,
      values: row,
      dayDifference: dayDifference
    });
  });

  if (candidates.length === 0) return { status: 'NONE', candidates: candidates };
  if (candidates.length > 1) return { status: 'MULTIPLE', candidates: candidates };

  return { status: 'ONE', candidates: candidates };
}

function familyFinancesAppendMarker_(existingNotes, message) {
  const notes = String(existingNotes || '').trim();
  const marker = FAMILY_FINANCES_SYNC_MARKER + ' ' + message;
  return notes ? notes + '; ' + marker : marker;
}

function familyFinancesExistingReviewIds_(reviewSheet) {
  const ids = new Set();
  if (!reviewSheet || reviewSheet.getLastRow() < 2) return ids;

  const values = reviewSheet.getRange(2, 1, reviewSheet.getLastRow() - 1, 1).getValues();
  values.forEach(function(row) {
    if (row[0]) ids.add(String(row[0]));
  });

  return ids;
}


function familyFinancesCloseResolvedReviews_(txSheet, reviewSheet) {
  if (
    !txSheet ||
    !reviewSheet ||
    txSheet.getLastRow() < 2 ||
    reviewSheet.getLastRow() < 2
  ) {
    return 0;
  }

  const txRows = txSheet
    .getRange(2, 1, txSheet.getLastRow() - 1, 11)
    .getValues();

  const resolvedById = new Map();

  txRows.forEach(function(row) {
    const transactionId = String(row[0] || '').trim();
    const status = String(row[7] || '').trim().toUpperCase();

    if (!transactionId) return;
    if (status !== 'MATCH_FOUND' && status !== 'INSERTED') return;

    resolvedById.set(transactionId, {
      status: status,
      monthlyTab: String(row[8] || '').trim(),
      matchedRow: row[9]
    });
  });

  if (!resolvedById.size) return 0;

  const reviewRows = reviewSheet
    .getRange(2, 1, reviewSheet.getLastRow() - 1, 10)
    .getValues();

  let closed = 0;

  reviewRows.forEach(function(row, index) {
    const transactionId = String(row[0] || '').trim();
    const action = String(row[7] || '').trim().toUpperCase();
    const resolved = resolvedById.get(transactionId);

    // Never overwrite a decision the user already made.
    if (!resolved || action) return;

    const reviewRow = index + 2;
    const matchedLocation = resolved.matchedRow
      ? resolved.monthlyTab + ' row ' + resolved.matchedRow
      : resolved.monthlyTab;

    reviewSheet.getRange(reviewRow, 7, 1, 4).setValues([[
      resolved.status === 'MATCH_FOUND'
        ? 'Resolved automatically - matched existing monthly row'
        : 'Resolved automatically - transaction already inserted',
      'IGNORED',
      "'" + resolved.monthlyTab,
      'Auto-closed by Family Finances sync: ' +
        resolved.status +
        (matchedLocation ? ' at ' + matchedLocation : '') +
        '. No review action is needed.'
    ]]);

    closed++;
  });

  return closed;
}

function familyFinancesMerchantSuggestion_(ss, merchant, currentCategory) {
  let cleanMerchant = String(merchant || '').trim();
  let category = String(currentCategory || '').trim();

  if (!category || category.toLowerCase() === 'uncategorized') {
    category = 'Needs Review';
  }

  const merchantSheet = ss.getSheetByName('Merchant_Map');

  if (
    merchantSheet &&
    typeof getMerchantMapRules_ === 'function' &&
    typeof findMerchantMapRule_ === 'function'
  ) {
    try {
      const rules = getMerchantMapRules_(merchantSheet);
      const match = findMerchantMapRule_(cleanMerchant, rules);

      if (match) {
        if (match.cleanOrigin) cleanMerchant = String(match.cleanOrigin);
        if (match.defaultCategory) category = String(match.defaultCategory);
      }
    } catch (err) {
      // Suggestion failure must never block bank reconciliation.
    }
  }

  return { merchant: cleanMerchant, category: category };
}


function familyFinancesAmountsEqual_(left, right) {
  const a = Number(left);
  const b = Number(right);

  return Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(a - b) <= 0.005;
}

function familyFinancesMerchantSharesCoreIdentity_(left, right) {
  if (familyFinancesMerchantLooksSame_(left, right)) return true;

  const aTokens = familyFinancesMerchantCoreTokens_(left);
  const bTokens = familyFinancesMerchantCoreTokens_(right);

  if (!aTokens.length || !bTokens.length) return false;

  const bSet = new Set(bTokens);
  const shared = aTokens.filter(function(token) {
    return bSet.has(token);
  });

  if (shared.length >= 2) return true;
  if (shared.length !== 1) return false;

  const token = shared[0];

  // Allow a single strong vendor token only when one side is essentially
  // the vendor name by itself. Example: "Apple" -> "Family Apple Music".
  return token.length >= 4 && (aTokens.length === 1 || bTokens.length === 1);
}

function familyFinancesFindAffirmPlanByPayment_(ss, amount) {
  const affirmSheet = ss.getSheetByName('Affirms');

  if (!affirmSheet || affirmSheet.getLastRow() < 11) {
    return { status: 'NONE', plans: [] };
  }

  // Affirms table:
  // A Plan ID, B Merchant, G Regular Payment.
  const rows = affirmSheet
    .getRange(11, 1, affirmSheet.getLastRow() - 10, 12)
    .getValues();

  const wanted = Math.abs(Number(amount));
  const plans = [];

  rows.forEach(function(row) {
    const planId = String(row[0] || '').trim();
    const merchant = String(row[1] || '').trim();
    const regularPayment = Math.abs(Number(row[6]));

    if (!planId || planId.toUpperCase() === 'TOTALS') return;
    if (!Number.isFinite(regularPayment)) return;
    if (Math.abs(regularPayment - wanted) > 0.005) return;

    plans.push({
      planId: planId,
      merchant: merchant,
      regularPayment: regularPayment
    });
  });

  if (plans.length === 0) return { status: 'NONE', plans: plans };
  if (plans.length > 1) return { status: 'MULTIPLE', plans: plans };

  return { status: 'ONE', plans: plans };
}

function familyFinancesFindPlannedCandidate_(ss, monthSheet, txDate, merchant, amount, bank) {
  if (!monthSheet || monthSheet.getLastRow() < 2) {
    return { status: 'NONE', candidates: [] };
  }

  const merchantText = familyFinancesNorm_(merchant);
  const bankText = familyFinancesNorm_(bank);
  const isAffirm = merchantText.includes('affirm');

  let affirmPlanResult = { status: 'NONE', plans: [] };

  if (isAffirm) {
    affirmPlanResult = familyFinancesFindAffirmPlanByPayment_(ss, amount);

    // If the Affirm tracker itself is ambiguous, do not guess.
    if (affirmPlanResult.status === 'MULTIPLE') {
      return {
        status: 'MULTIPLE',
        candidates: [],
        reason: 'Affirms tracker has multiple plans with this payment amount.'
      };
    }

    // Require the amount to exist in the Affirms tracker before using the
    // Affirm-specific planned-row shortcut.
    if (affirmPlanResult.status !== 'ONE') {
      return { status: 'NONE', candidates: [] };
    }
  }

  const rows = monthSheet.getRange(2, 1, monthSheet.getLastRow() - 1, 6).getValues();
  const candidates = [];

  rows.forEach(function(row, index) {
    const rowDateRaw = row[0];
    const rowMerchant = row[1];
    const rowForecast = row[2];
    const rowActual = row[3];
    const rowBank = row[4];

    if (!rowMerchant) return;
    if (!familyFinancesAmountsEqual_(rowForecast, amount)) return;

    // Planned rows may not have a bank assigned yet. A nonblank conflicting
    // bank is a reason to reject the candidate.
    const rowBankText = familyFinancesNorm_(rowBank);
    if (rowBankText && bankText && rowBankText !== bankText) return;

    // If an actual amount is already present, it must be the same amount.
    if (
      rowActual !== '' &&
      rowActual !== null &&
      !familyFinancesAmountsEqual_(rowActual, amount)
    ) {
      return;
    }

    if (!(rowDateRaw instanceof Date) || isNaN(rowDateRaw.getTime())) return;

    const dayDifference = Math.abs(
      (rowDateRaw.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (dayDifference > 7) return;

    const rowMerchantText = familyFinancesNorm_(rowMerchant);

    if (isAffirm) {
      if (!rowMerchantText.includes('affirm')) return;
    } else if (!familyFinancesMerchantSharesCoreIdentity_(merchant, rowMerchant)) {
      return;
    }

    candidates.push({
      rowNumber: index + 2,
      values: row,
      source: isAffirm ? 'Affirms tracker + monthly planned row' : 'monthly planned row',
      affirmPlan: isAffirm ? affirmPlanResult.plans[0] : null
    });
  });

  if (candidates.length === 0) return { status: 'NONE', candidates: candidates };
  if (candidates.length > 1) return { status: 'MULTIPLE', candidates: candidates };

  return { status: 'ONE', candidates: candidates };
}

function familyFinancesFindVerifiedCandidate_(monthSheet, txDate, merchant, amount, bank) {
  if (!monthSheet || monthSheet.getLastRow() < 2) {
    return { status: 'NONE', candidates: [] };
  }

  if (typeof plaidClearMatch_ !== 'function') {
    throw new Error('plaidClearMatch_() is missing from the recurring clear script.');
  }

  const rows = monthSheet.getRange(2, 1, monthSheet.getLastRow() - 1, 6).getValues();
  const candidates = [];

  rows.forEach(function(row, index) {
    if (!plaidClearMatch_(txDate, merchant, amount, bank, row)) return;

    candidates.push({
      rowNumber: index + 2,
      values: row
    });
  });

  if (candidates.length === 0) return { status: 'NONE', candidates: candidates };
  if (candidates.length > 1) return { status: 'MULTIPLE', candidates: candidates };

  return { status: 'ONE', candidates: candidates };
}


function familyFinancesFindPendingForecastRow_(monthSheet, transactionId, amount) {
  if (!monthSheet || !transactionId || monthSheet.getLastRow() < 2) return null;

  const marker = 'PLAID_PENDING:' + String(transactionId);
  const rowCount = monthSheet.getLastRow() - 1;
  const values = monthSheet.getRange(2, 3, rowCount, 7).getValues();

  for (let i = 0; i < values.length; i++) {
    const forecast = values[i][0]; // Column C
    const notes = values[i][6];    // Column I

    if (!String(notes || '').includes(marker)) continue;
    if (!familyFinancesAmountsEqual_(forecast, amount)) continue;

    return i + 2;
  }

  return null;
}

function familyFinancesTagPendingRow_(monthSheet, rowNumber, transactionId) {
  const noteCell = monthSheet.getRange(rowNumber, 9);
  const current = String(noteCell.getValue() || '').trim();
  const marker = 'PLAID_PENDING:' + String(transactionId);

  if (!current.includes(marker)) {
    noteCell.setValue(current ? current + '; ' + marker : marker);
  }
}

function familyFinancesPendingAmountMayVary_(merchant, category) {
  // Only strong recurring-bill types may reuse a nearby planned row when
  // the bank amount changed. Mixed merchants such as Amazon/Walmart/Sam's/Zelle
  // must NEVER merge different amounts.
  if (familyFinancesIsMixedMerchant_(merchant)) return false;

  const normalizedCategory = String(category || '').trim().toLowerCase();
  return normalizedCategory === 'utilities' ||
    normalizedCategory === 'subscriptions' ||
    normalizedCategory === 'insurance';
}

function familyFinancesFindPendingMerchantCandidate_(
  monthSheet,
  dateValue,
  merchant,
  amount,
  bank,
  category
) {
  if (!monthSheet || monthSheet.getLastRow() < 2) {
    return { status: 'NONE', candidates: [] };
  }

  const txDate = new Date(dateValue);
  const rows = monthSheet.getRange(2, 1, monthSheet.getLastRow() - 1, 6).getValues();
  const candidates = [];
  const allowAmountVariance = familyFinancesPendingAmountMayVary_(merchant, category);

  rows.forEach(function(row, index) {
    const rowDate = row[0];
    const rowMerchant = String(row[1] || '').trim();
    const forecast = row[2];
    const actual = row[3];
    const rowBank = String(row[4] || '').trim();

    if (!(rowDate instanceof Date) || isNaN(rowDate.getTime())) return;

    const rowBankNorm = familyFinancesNorm_(rowBank);
    const bankNorm = familyFinancesNorm_(bank);
    if (rowBankNorm && bankNorm && rowBankNorm !== bankNorm) return;

    if (actual !== '' && actual !== null) return;
    if (forecast === '' || forecast === null) return;
    if (!familyFinancesMerchantSharesCoreIdentity_(merchant, rowMerchant)) return;

    // Exact amount is required for ordinary/mixed merchants. Only a strong
    // recurring-bill category may reuse the row when the amount changed.
    if (!familyFinancesAmountsEqual_(forecast, amount) && !allowAmountVariance) return;

    const dayDifference = Math.abs(
      Math.round((txDate.getTime() - rowDate.getTime()) / 86400000)
    );

    if (dayDifference > 7) return;

    candidates.push({
      rowNumber: index + 2,
      values: row,
      dayDifference: dayDifference,
      amountVariance: !familyFinancesAmountsEqual_(forecast, amount)
    });
  });

  if (candidates.length === 0) return { status: 'NONE', candidates: candidates };
  if (candidates.length > 1) return { status: 'MULTIPLE', candidates: candidates };
  return { status: 'ONE', candidates: candidates };
}

function familyFinancesCycleSubtotalRows_(monthSheet) {
  const lastRow = monthSheet.getLastRow();
  if (lastRow < 2) return [];

  const formulas = monthSheet.getRange(1, 3, lastRow, 2).getFormulas();
  const rows = [];

  formulas.forEach(function(pair, index) {
    const cFormula = String(pair[0] || '').trim();
    const dFormula = String(pair[1] || '').trim();

    if (
      /^=SUM\(C\d+:C\d+\)$/i.test(cFormula) &&
      /^=SUM\(D\d+:D\d+\)$/i.test(dFormula)
    ) {
      rows.push(index + 1);
    }
  });

  return rows;
}

function familyFinancesRepairCycleSubtotalFormulas_(monthSheet) {
  const subtotalRows = familyFinancesCycleSubtotalRows_(monthSheet);

  subtotalRows.forEach(function(rowNumber, index) {
    const startRow = index === 0 ? 2 : subtotalRows[index - 1];
    const endRow = rowNumber - 1;

    monthSheet.getRange(rowNumber, 3).setFormula(
      '=SUM(C' + startRow + ':C' + endRow + ')'
    );
    monthSheet.getRange(rowNumber, 4).setFormula(
      '=SUM(D' + startRow + ':D' + endRow + ')'
    );
  });

  return subtotalRows;
}

function familyFinancesFindCycleSubtotalRow_(monthSheet, dateValue) {
  const subtotalRows = familyFinancesCycleSubtotalRows_(monthSheet);
  if (!subtotalRows.length) return null;

  const txTime = new Date(dateValue).getTime();

  for (let i = 0; i < subtotalRows.length; i++) {
    const subtotalRow = subtotalRows[i];
    const sectionStart = i === 0 ? 2 : subtotalRows[i - 1] + 1;
    const rowCount = Math.max(0, subtotalRow - sectionStart);

    if (!rowCount) continue;

    const dates = monthSheet
      .getRange(sectionStart, 1, rowCount, 1)
      .getValues();

    let maxTime = null;

    dates.forEach(function(row) {
      const value = row[0];
      if (!(value instanceof Date) || isNaN(value.getTime())) return;
      const time = value.getTime();
      if (maxTime === null || time > maxTime) maxTime = time;
    });

    if (maxTime !== null && txTime <= maxTime) {
      return subtotalRow;
    }
  }

  return subtotalRows[subtotalRows.length - 1];
}

function familyFinancesWriteMonthlyTransaction_(
  monthSheet,
  transactionId,
  dateValue,
  merchant,
  amount,
  bank,
  category,
  pending
) {
  if (!monthSheet) {
    return { inserted: false, reason: 'monthly tab not found' };
  }

  let subtotalRow = familyFinancesFindCycleSubtotalRow_(monthSheet, dateValue);
  if (!subtotalRow) {
    return { inserted: false, reason: 'cycle subtotal rows not found' };
  }

  const subtotalRows = familyFinancesCycleSubtotalRows_(monthSheet);
  const subtotalIndex = subtotalRows.indexOf(subtotalRow);
  const sectionStart = subtotalIndex <= 0 ? 2 : subtotalRows[subtotalIndex - 1] + 1;
  const rowCount = Math.max(0, subtotalRow - sectionStart);
  let targetRow = null;

  if (rowCount > 0) {
    const rows = monthSheet
      .getRange(sectionStart, 1, rowCount, 6)
      .getValues();

    for (let i = 0; i < rows.length; i++) {
      const isBlank = rows[i].every(function(value) {
        return value === '' || value === null;
      });

      if (isBlank) {
        targetRow = sectionStart + i;
        break;
      }
    }
  }

  if (!targetRow) {
    // Add capacity only at the END of a pay-cycle section. This avoids
    // shoving planned bills around inside the cycle. After the insert, rebuild
    // the rolling subtotal formulas so all cycle totals remain correct.
    monthSheet.insertRowsBefore(subtotalRow, 1);
    targetRow = subtotalRow;

    const sourceRow = Math.max(sectionStart, targetRow - 1);
    if (sourceRow !== targetRow) {
      const sourceRange = monthSheet.getRange(sourceRow, 1, 1, 9);
      const targetRange = monthSheet.getRange(targetRow, 1, 1, 9);
      sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    }

    familyFinancesRepairCycleSubtotalFormulas_(monthSheet);
  }

  const safeCategory =
    String(category || '').trim().toLowerCase() === 'needs review'
      ? ''
      : String(category || '').trim();

  monthSheet.getRange(targetRow, 1, 1, 6).setValues([[
    dateValue,
    merchant,
    amount,
    pending ? '' : amount,
    bank,
    safeCategory
  ]]);

  const marker = (pending ? 'PLAID_PENDING:' : 'PLAID_TX:') + String(transactionId);
  monthSheet.getRange(targetRow, 9).setValue(marker);

  return {
    inserted: true,
    rowNumber: targetRow
  };
}

function familyFinancesRecoverReadyToInsert_(ss, txSheet) {
  if (!txSheet || txSheet.getLastRow() < 2) return 0;

  const rows = txSheet
    .getRange(2, 1, txSheet.getLastRow() - 1, 11)
    .getValues();

  let recovered = 0;

  rows.forEach(function(row, index) {
    const status = String(row[7] || '').trim().toUpperCase();
    if (status !== 'READY_TO_INSERT') return;

    const transactionId = String(row[0] || '').trim();
    const dateValue = row[1];
    const merchant = String(row[2] || '').trim();
    const amount = Number(row[3]);
    const bank = String(row[4] || '').trim();
    const category = String(row[5] || '').trim();
    const monthlyTab = familyFinancesNormalizeMonthlyTabValue_(row[8], dateValue);
    const sheetRow = index + 2;

    if (
      !transactionId ||
      !(dateValue instanceof Date) ||
      isNaN(dateValue.getTime()) ||
      !Number.isFinite(amount) ||
      !bank ||
      !monthlyTab
    ) {
      return;
    }

    const monthSheet = ss.getSheetByName(monthlyTab);
    if (!monthSheet) return;

    const exactResult = familyFinancesFindExactBankAmountDateCandidate_(
      monthSheet,
      dateValue,
      amount,
      bank
    );

    if (exactResult.status === 'ONE') {
      const candidate = exactResult.candidates[0];
      txSheet.getRange(sheetRow, 8, 1, 3).setValues([[
        'MATCH_FOUND',
        monthlyTab,
        candidate.rowNumber
      ]]);
      txSheet.getRange(sheetRow, 11).setValue(
        familyFinancesAppendMarker_(
          row[10],
          'recovered READY_TO_INSERT by matching existing monthly row ' +
          candidate.rowNumber + '.'
        )
      );
      recovered++;
      return;
    }

    const plannedResult = familyFinancesFindPlannedCandidate_(
      ss,
      monthSheet,
      dateValue,
      merchant,
      amount,
      bank
    );

    if (plannedResult.status === 'ONE') {
      const candidate = plannedResult.candidates[0];
      const actual = candidate.values[3];

      if (actual === '' || actual === null) {
        monthSheet.getRange(candidate.rowNumber, 4).setValue(amount);

        if (!String(candidate.values[4] || '').trim()) {
          monthSheet.getRange(candidate.rowNumber, 5).setValue(bank);
        }
        if (!String(candidate.values[5] || '').trim() && category) {
          monthSheet.getRange(candidate.rowNumber, 6).setValue(category);
        }
      }

      txSheet.getRange(sheetRow, 8, 1, 3).setValues([[
        'MATCH_FOUND',
        monthlyTab,
        candidate.rowNumber
      ]]);
      txSheet.getRange(sheetRow, 11).setValue(
        familyFinancesAppendMarker_(
          row[10],
          'recovered READY_TO_INSERT by clearing planned monthly row ' +
          candidate.rowNumber + '.'
        )
      );
      recovered++;
      return;
    }

    if (
      amount < 0 &&
      !familyFinancesIsMixedMerchant_(merchant) &&
      familyFinancesIsAutoInsertCategory_(category)
    ) {
      const writeResult = familyFinancesWriteMonthlyTransaction_(
        monthSheet,
        transactionId,
        dateValue,
        merchant,
        amount,
        bank,
        category,
        false
      );

      if (writeResult.inserted) {
        txSheet.getRange(sheetRow, 8, 1, 3).setValues([[
          'INSERTED',
          monthlyTab,
          writeResult.rowNumber
        ]]);
        txSheet.getRange(sheetRow, 11).setValue(
          familyFinancesAppendMarker_(
            row[10],
            'recovered READY_TO_INSERT directly into monthly row ' +
            writeResult.rowNumber + '.'
          )
        );
        recovered++;
      }
    }
  });

  return recovered;
}


function familyFinancesFindExistingPendingCandidate_(
  monthSheet,
  dateValue,
  merchant,
  amount,
  bank
) {
  if (!monthSheet || monthSheet.getLastRow() < 2) {
    return { status: 'NONE', candidates: [] };
  }

  const txDate = new Date(dateValue);
  const wantedBank = familyFinancesNorm_(bank);
  const rows = monthSheet.getRange(2, 1, monthSheet.getLastRow() - 1, 6).getValues();
  const candidates = [];

  rows.forEach(function(row, index) {
    const rowDate = row[0];
    const rowMerchant = String(row[1] || '').trim();
    const rowForecast = row[2];
    const rowActual = row[3];
    const rowBank = String(row[4] || '').trim();

    if (!(rowDate instanceof Date) || isNaN(rowDate.getTime())) return;
    if (rowActual !== '' && rowActual !== null) return;
    if (!familyFinancesAmountsEqual_(rowForecast, amount)) return;

    const rowBankNorm = familyFinancesNorm_(rowBank);
    if (rowBankNorm && wantedBank && rowBankNorm !== wantedBank) return;

    if (!familyFinancesMerchantSharesCoreIdentity_(merchant, rowMerchant)) return;

    const dayDifference = Math.abs(
      (rowDate.getTime() - txDate.getTime()) / 86400000
    );

    if (dayDifference > 4) return;

    candidates.push({
      rowNumber: index + 2,
      values: row,
      dayDifference: dayDifference
    });
  });

  if (candidates.length === 0) return { status: 'NONE', candidates: candidates };
  if (candidates.length > 1) return { status: 'MULTIPLE', candidates: candidates };
  return { status: 'ONE', candidates: candidates };
}



function familyFinancesRemovePendingMarker_(monthSheet, rowNumber, transactionId) {
  const cell = monthSheet.getRange(rowNumber, 9);
  const current = String(cell.getValue() || '').trim();
  if (!current) return false;

  const marker = 'PLAID_PENDING:' + String(transactionId);
  const parts = current
    .split(';')
    .map(function(part) { return String(part || '').trim(); })
    .filter(function(part) { return part && part !== marker; });

  if (parts.join('; ') === current) return false;

  cell.setValue(parts.join('; '));
  return true;
}

function familyFinancesRepairPendingMarkerCollisions_(ss, txSheet) {
  if (!txSheet || txSheet.getLastRow() < 2) {
    return { repairedMarkers: 0, reprocessed: 0 };
  }

  const rows = txSheet
    .getRange(2, 1, txSheet.getLastRow() - 1, 11)
    .getValues();

  let repairedMarkers = 0;
  let reprocessed = 0;

  rows.forEach(function(row, index) {
    const transactionId = String(row[0] || '').trim();
    const dateValue = row[1];
    const merchant = String(row[2] || '').trim();
    const amount = Number(row[3]);
    const bank = String(row[4] || '').trim();
    const category = String(row[5] || '').trim();
    const pending = familyFinancesIsPending_(row[6]);
    const status = String(row[7] || '').trim().toUpperCase();
    const notes = String(row[10] || '');
    const lowerNotes = notes.toLowerCase();
    const sheetRow = index + 2;

    if (!transactionId || !pending || status !== 'REVIEW') return;
    if (!(dateValue instanceof Date) || isNaN(dateValue.getTime())) return;
    if (!Number.isFinite(amount) || !bank) return;
    if (!lowerNotes.includes('legacy pending recovery v3 complete')) return;
    if (lowerNotes.includes('pending collision repair v4 complete')) return;

    const monthlyTab = familyFinancesMonthTabName_(dateValue);
    const monthSheet = ss.getSheetByName(monthlyTab);
    if (!monthSheet) return;

    const marker = 'PLAID_PENDING:' + transactionId;
    const rowCount = Math.max(0, monthSheet.getLastRow() - 1);

    if (rowCount > 0) {
      const monthly = monthSheet.getRange(2, 3, rowCount, 7).getValues();

      monthly.forEach(function(monthRow, monthIndex) {
        const forecast = monthRow[0];
        const markerCell = String(monthRow[6] || '');

        if (!markerCell.includes(marker)) return;
        if (familyFinancesAmountsEqual_(forecast, amount)) return;

        if (familyFinancesRemovePendingMarker_(
          monthSheet,
          monthIndex + 2,
          transactionId
        )) {
          repairedMarkers++;
        }
      });
    }

    const result = familyFinancesInsertPendingForecast_(
      ss,
      monthSheet,
      transactionId,
      dateValue,
      merchant,
      amount,
      bank,
      category || 'Needs Review'
    );

    if (result.inserted || result.existing) {
      txSheet.getRange(sheetRow, 9, 1, 2).setValues([[
        monthlyTab,
        result.rowNumber
      ]]);

      txSheet.getRange(sheetRow, 11).setValue(
        familyFinancesAppendMarker_(
          notes,
          'pending collision repair v4 complete; pending amount is represented in ' +
          monthlyTab + ' row ' + result.rowNumber + '.'
        )
      );
      reprocessed++;
      return;
    }

    txSheet.getRange(sheetRow, 11).setValue(
      familyFinancesAppendMarker_(
        notes,
        'pending collision repair v4 complete; still not represented: ' +
        String(result.reason || 'no safe monthly target found') + '.'
      )
    );
  });

  return {
    repairedMarkers: repairedMarkers,
    reprocessed: reprocessed
  };
}

function familyFinancesRecoverLegacyPending_(ss, txSheet) {
  if (!txSheet || txSheet.getLastRow() < 2) return 0;

  const rows = txSheet
    .getRange(2, 1, txSheet.getLastRow() - 1, 11)
    .getValues();

  let recovered = 0;

  rows.forEach(function(row, index) {
    const transactionId = String(row[0] || '').trim();
    const dateValue = row[1];
    const merchant = String(row[2] || '').trim();
    const amount = Number(row[3]);
    const bank = String(row[4] || '').trim();
    const category = String(row[5] || '').trim();
    const pending = familyFinancesIsPending_(row[6]);
    const status = String(row[7] || '').trim().toUpperCase();
    const notes = String(row[10] || '');
    const lowerNotes = notes.toLowerCase();
    const sheetRow = index + 2;

    if (!transactionId || status !== 'REVIEW' || !pending) return;
    if (
      !lowerNotes.includes('pending bank item could not be added to forecast') &&
      !lowerNotes.includes('legacy pending recovery v2 complete')
    ) return;
    if (lowerNotes.includes('legacy pending recovery v3 complete')) return;
    if (!(dateValue instanceof Date) || isNaN(dateValue.getTime())) return;
    if (!Number.isFinite(amount) || !bank) return;

    const monthlyTab = familyFinancesMonthTabName_(dateValue);
    const monthSheet = ss.getSheetByName(monthlyTab);

    if (!monthSheet) {
      txSheet.getRange(sheetRow, 11).setValue(
        familyFinancesAppendMarker_(
          notes,
          'legacy pending recovery v3 complete; monthly tab not found.'
        )
      );
      return;
    }

    const result = familyFinancesInsertPendingForecast_(
      ss,
      monthSheet,
      transactionId,
      dateValue,
      merchant,
      amount,
      bank,
      category || 'Needs Review'
    );

    if (result.inserted || result.existing) {
      txSheet.getRange(sheetRow, 9, 1, 2).setValues([[
        monthlyTab,
        result.rowNumber
      ]]);

      txSheet.getRange(sheetRow, 11).setValue(
        familyFinancesAppendMarker_(
          notes,
          'legacy pending recovery v3 complete; pending amount is represented in ' +
          monthlyTab + ' row ' + result.rowNumber + '.'
        )
      );
      recovered++;
      return;
    }

    txSheet.getRange(sheetRow, 11).setValue(
      familyFinancesAppendMarker_(
        notes,
        'legacy pending recovery v3 complete; still not represented: ' +
        String(result.reason || 'no safe monthly target found') + '.'
      )
    );
  });

  return recovered;
}

function familyFinancesInsertPendingForecast_(
  ss,
  monthSheet,
  transactionId,
  dateValue,
  merchant,
  amount,
  bank,
  category
) {
  if (!monthSheet) return { inserted: false, reason: 'monthly tab not found' };

  const existingRow = familyFinancesFindPendingForecastRow_(monthSheet, transactionId, amount);
  if (existingRow) {
    return { inserted: false, existing: true, rowNumber: existingRow };
  }

  // A legacy retry or duplicate Plaid pending id can point at the same
  // underlying purchase. Reuse an existing monthly pending forecast when
  // bank + amount + merchant + nearby date identify exactly one row.
  const existingPendingResult = familyFinancesFindExistingPendingCandidate_(
    monthSheet,
    dateValue,
    merchant,
    amount,
    bank
  );

  if (existingPendingResult.status === 'ONE') {
    const candidate = existingPendingResult.candidates[0];

    if (!String(candidate.values[4] || '').trim() && bank) {
      monthSheet.getRange(candidate.rowNumber, 5).setValue(bank);
    }
    if (!String(candidate.values[5] || '').trim() && category &&
        String(category).trim().toLowerCase() !== 'needs review') {
      monthSheet.getRange(candidate.rowNumber, 6).setValue(category);
    }

    familyFinancesTagPendingRow_(monthSheet, candidate.rowNumber, transactionId);

    return {
      inserted: false,
      existing: true,
      rowNumber: candidate.rowNumber,
      matchedPending: true
    };
  }

  // Before inserting anything, reconcile against an exact manually-entered
  // row. This prevents pending bank activity from duplicating rows Steve
  // already entered himself.
  const exactResult = familyFinancesFindExactBankAmountDateCandidate_(
    monthSheet,
    dateValue,
    amount,
    bank
  );

  if (exactResult.status === 'ONE') {
    const candidate = exactResult.candidates[0];
    familyFinancesTagPendingRow_(monthSheet, candidate.rowNumber, transactionId);
    return {
      inserted: false,
      existing: true,
      rowNumber: candidate.rowNumber,
      matchedExisting: true
    };
  }

  // Recurring merchants can legitimately change amount (Starlink was the
  // first live example). If there is exactly one nearby planned row for the
  // same bank + merchant, update Forecast C to the pending amount instead of
  // inserting a second row.
  const merchantResult = familyFinancesFindPendingMerchantCandidate_(
    monthSheet,
    dateValue,
    merchant,
    amount,
    bank,
    category
  );

  if (merchantResult.status === 'ONE') {
    const candidate = merchantResult.candidates[0];

    if (candidate.amountVariance && familyFinancesIsMixedMerchant_(merchant)) {
      return {
        inserted: false,
        reason: 'mixed merchant amount differs from existing pending forecast'
      };
    }
    if (candidate.amountVariance) {
      monthSheet.getRange(candidate.rowNumber, 3).setValue(amount);
    }

    if (!String(candidate.values[5] || '').trim() && category &&
        String(category).trim().toLowerCase() !== 'needs review') {
      monthSheet.getRange(candidate.rowNumber, 6).setValue(category);
    }

    familyFinancesTagPendingRow_(monthSheet, candidate.rowNumber, transactionId);

    return {
      inserted: false,
      existing: true,
      rowNumber: candidate.rowNumber,
      matchedPlanned: true
    };
  }

  return familyFinancesWriteMonthlyTransaction_(
    monthSheet,
    transactionId,
    dateValue,
    merchant,
    amount,
    bank,
    category,
    true
  );
}


function familyFinancesPendingSourceIdFromNotes_(notes) {
  const text = String(notes || '');
  const match = text.match(/Posted from pending transaction\s+([^;\s]+)/i);
  return match ? String(match[1] || '').trim() : '';
}

function familyFinancesFindPendingMarkerCandidate_(
  monthSheet,
  pendingTransactionId,
  amount,
  bank
) {
  if (
    !monthSheet ||
    !pendingTransactionId ||
    monthSheet.getLastRow() < 2
  ) {
    return { status: 'NONE', candidates: [] };
  }

  const marker = 'PLAID_PENDING:' + String(pendingTransactionId);
  const wantedBank = familyFinancesNorm_(bank);
  const rows = monthSheet
    .getRange(2, 1, monthSheet.getLastRow() - 1, 9)
    .getValues();

  const candidates = [];

  rows.forEach(function(row, index) {
    const forecast = row[2];
    const actual = row[3];
    const rowBank = row[4];
    const notes = String(row[8] || '');

    if (!notes.includes(marker)) return;
    if (!familyFinancesAmountsEqual_(forecast, amount)) return;

    const rowBankNorm = familyFinancesNorm_(rowBank);
    if (rowBankNorm && wantedBank && rowBankNorm !== wantedBank) return;

    if (
      actual !== '' &&
      actual !== null &&
      !familyFinancesAmountsEqual_(actual, amount)
    ) {
      return;
    }

    candidates.push({
      rowNumber: index + 2,
      values: row
    });
  });

  if (candidates.length === 0) {
    return { status: 'NONE', candidates: candidates };
  }
  if (candidates.length > 1) {
    return { status: 'MULTIPLE', candidates: candidates };
  }

  return { status: 'ONE', candidates: candidates };
}

function familyFinancesResolvePostedFromPending_(
  monthSheet,
  postedTransactionId,
  pendingTransactionId,
  amount,
  bank,
  category
) {
  const result = familyFinancesFindPendingMarkerCandidate_(
    monthSheet,
    pendingTransactionId,
    amount,
    bank
  );

  if (result.status !== 'ONE') return result;

  const candidate = result.candidates[0];
  const rowNumber = candidate.rowNumber;
  const actual = candidate.values[3];

  if (actual === '' || actual === null) {
    monthSheet.getRange(rowNumber, 4).setValue(amount);
  }

  if (!String(candidate.values[4] || '').trim() && bank) {
    monthSheet.getRange(rowNumber, 5).setValue(bank);
  }

  if (
    !String(candidate.values[5] || '').trim() &&
    category &&
    String(category).trim().toLowerCase() !== 'needs review'
  ) {
    monthSheet.getRange(rowNumber, 6).setValue(category);
  }

  const noteCell = monthSheet.getRange(rowNumber, 9);
  const current = String(noteCell.getValue() || '').trim();
  const postedMarker = 'PLAID_TX:' + String(postedTransactionId);

  if (!current.includes(postedMarker)) {
    noteCell.setValue(current ? current + '; ' + postedMarker : postedMarker);
  }

  return {
    status: 'ONE',
    candidates: result.candidates,
    rowNumber: rowNumber
  };
}

function familyFinancesRecoverPostedFromPending_(ss, txSheet) {
  if (!txSheet || txSheet.getLastRow() < 2) return 0;

  const rows = txSheet
    .getRange(2, 1, txSheet.getLastRow() - 1, 11)
    .getValues();

  let recovered = 0;

  rows.forEach(function(row, index) {
    const transactionId = String(row[0] || '').trim();
    const dateValue = row[1];
    const amount = Number(row[3]);
    const bank = String(row[4] || '').trim();
    const category = String(row[5] || '').trim();
    const pending = familyFinancesIsPending_(row[6]);
    const status = String(row[7] || '').trim().toUpperCase();
    const notes = String(row[10] || '');
    const lowerNotes = notes.toLowerCase();
    const sheetRow = index + 2;

    if (!transactionId || pending || status !== 'REVIEW') return;
    if (lowerNotes.includes('posted-from-pending recovery v1 complete')) return;
    if (!(dateValue instanceof Date) || isNaN(dateValue.getTime())) return;
    if (!Number.isFinite(amount) || !bank) return;

    const pendingTransactionId = familyFinancesPendingSourceIdFromNotes_(notes);
    if (!pendingTransactionId) return;

    const monthlyTab = familyFinancesMonthTabName_(dateValue);
    const monthSheet = ss.getSheetByName(monthlyTab);
    if (!monthSheet) return;

    const result = familyFinancesResolvePostedFromPending_(
      monthSheet,
      transactionId,
      pendingTransactionId,
      amount,
      bank,
      category
    );

    if (result.status === 'ONE') {
      txSheet.getRange(sheetRow, 8, 1, 3).setValues([[
        'MATCH_FOUND',
        monthlyTab,
        result.rowNumber
      ]]);

      txSheet.getRange(sheetRow, 11).setValue(
        familyFinancesAppendMarker_(
          notes,
          'posted-from-pending recovery v1 complete; cleared monthly row ' +
          result.rowNumber +
          ' using exact predecessor pending marker + exact amount + bank.'
        )
      );

      recovered++;
      return;
    }

    txSheet.getRange(sheetRow, 11).setValue(
      familyFinancesAppendMarker_(
        notes,
        'posted-from-pending recovery v1 complete; ' +
        (result.status === 'MULTIPLE'
          ? 'multiple monthly rows carried the predecessor pending marker.'
          : 'no exact predecessor pending row found.')
      )
    );
  });

  return recovered;
}

function familyFinancesQueueReview_(
  reviewSheet,
  existingReviewIds,
  transactionId,
  dateValue,
  merchant,
  amount,
  bank,
  category,
  monthlyTab,
  reason,
  originalNotes
) {
  if (existingReviewIds.has(String(transactionId))) return false;

  reviewSheet.appendRow([
    transactionId,
    dateValue,
    merchant,
    amount,
    bank,
    category || 'Needs Review',
    reason,
    '',
    monthlyTab,
    originalNotes || ''
  ]);
  familyFinancesSetPlainText_(reviewSheet.getRange(reviewSheet.getLastRow(), 9), monthlyTab);

  existingReviewIds.add(String(transactionId));
  return true;
}

function familyFinancesQueueAutoApprove_(
  reviewSheet,
  existingReviewIds,
  transactionId,
  dateValue,
  merchant,
  amount,
  bank,
  category,
  monthlyTab,
  originalNotes
) {
  if (existingReviewIds.has(String(transactionId))) return false;

  reviewSheet.appendRow([
    transactionId,
    dateValue,
    merchant,
    amount,
    bank,
    category,
    'Auto-approved: posted ordinary transaction with confident category and no monthly match',
    'APPROVE',
    monthlyTab,
    originalNotes || ''
  ]);
  familyFinancesSetPlainText_(reviewSheet.getRange(reviewSheet.getLastRow(), 9), monthlyTab);

  existingReviewIds.add(String(transactionId));
  return true;
}



function familyFinancesAppendLog_(logSheet, rowValues) {
  // Route sync status to the Apps Script execution log while the historical
  // Sync_Log tab is being cleaned up. This preserves diagnostics without
  // allowing stale sheet validation to interrupt transaction processing.
  Logger.log(rowValues.map(function(value) {
    return value instanceof Date ? value.toISOString() : String(value == null ? '' : value);
  }).join(' | '));
}

function familyFinancesSetPlainText_(range, value) {
  // Monthly-tab cells must be free text. Some older sheet validation rules
  // accidentally reached these cells and can reject values like
  // "09-September 2026" as if they were categories.
  range.clearDataValidations();
  range.setNumberFormat('@');
  range.setValue(String(value || ''));
}

function familyFinancesNormalizeMonthlyTabValue_(value, fallbackDate) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return familyFinancesMonthTabName_(value);
  }

  const text = String(value || '').replace(/^'/, '').trim();

  if (/^\d{2}-[A-Za-z]+\s+\d{4}$/.test(text)) {
    return text;
  }

  if (text) {
    const parsed = new Date(text);
    if (!isNaN(parsed.getTime())) {
      return familyFinancesMonthTabName_(parsed);
    }
  }

  if (fallbackDate instanceof Date && !isNaN(fallbackDate.getTime())) {
    return familyFinancesMonthTabName_(fallbackDate);
  }

  return text;
}

function familyFinancesRepairMonthlyTabValues_(txSheet, reviewSheet) {
  // New writes force Monthly Tab cells to plain text before setting the value.
  // Older rows may still contain a real Date value from the previous bug.
  // Repair ONLY those actual Date-valued cells. Do not touch category/action
  // fields during routine sync; that avoids stale validation rules blocking
  // unrelated transaction processing.
  let repaired = 0;

  function repairSheet_(sheet, dateCol, tabCol) {
    if (!sheet || sheet.getLastRow() < 2) return;

    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(dateCol, tabCol)).getValues();

    values.forEach(function(row, index) {
      const fallbackDate = row[dateCol - 1];
      const rawTab = row[tabCol - 1];

      if (!(rawTab instanceof Date) || isNaN(rawTab.getTime())) return;

      const normalizedTab = familyFinancesNormalizeMonthlyTabValue_(rawTab, fallbackDate);
      if (!normalizedTab) return;

      const cell = sheet.getRange(index + 2, tabCol);
      cell.clearDataValidations();
      cell.setNumberFormat('@');
      cell.setValue(normalizedTab);
      repaired++;
    });
  }

  repairSheet_(txSheet, 2, 9);
  repairSheet_(reviewSheet, 2, 9);

  return {
    repaired: repaired,
    recoveredApprovals: 0
  };
}

function familyFinancesCountPendingIgnores_(reviewSheet) {
  if (!reviewSheet || reviewSheet.getLastRow() < 2) return 0;

  const actions = reviewSheet
    .getRange(2, 8, reviewSheet.getLastRow() - 1, 1)
    .getValues();

  return actions.reduce(function(count, row) {
    return count + (
      String(row[0] || '').trim().toUpperCase() === 'IGNORE' ? 1 : 0
    );
  }, 0);
}

function familyFinancesProcessIgnoredReviews_(reviewSheet) {
  const ignoreCount = familyFinancesCountPendingIgnores_(reviewSheet);

  if (!ignoreCount) return 0;

  if (typeof processIgnoredReviewRows !== 'function') {
    throw new Error(
      'Ignored-review automation is missing Code.gs function: processIgnoredReviewRows'
    );
  }

  processIgnoredReviewRows();
  return ignoreCount;
}

function familyFinancesArchiveResolvedReviews_(ss, txSheet, reviewSheet) {
  if (
    !txSheet ||
    !reviewSheet ||
    reviewSheet.getLastRow() < 2
  ) {
    return 0;
  }

  let archiveSheet = ss.getSheetByName('Plaid_Review_Archive');

  if (!archiveSheet) {
    archiveSheet = ss.insertSheet('Plaid_Review_Archive');
    const headers = reviewSheet
      .getRange(1, 1, 1, reviewSheet.getLastColumn())
      .getValues();
    archiveSheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
    archiveSheet.setFrozenRows(1);
    archiveSheet.hideSheet();
  }

  const txRows = txSheet
    .getRange(2, 1, Math.max(1, txSheet.getLastRow() - 1), 8)
    .getValues();

  const txStatusById = new Map();

  txRows.forEach(function(row) {
    const id = String(row[0] || '').trim();
    if (!id) return;
    txStatusById.set(id, String(row[7] || '').trim().toUpperCase());
  });

  const lastRow = reviewSheet.getLastRow();
  const lastCol = reviewSheet.getLastColumn();
  const reviewRows = reviewSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const archiveRows = [];
  const deleteRows = [];

  reviewRows.forEach(function(row, index) {
    const id = String(row[0] || '').trim();
    const action = String(row[7] || '').trim().toUpperCase();
    const txStatus = txStatusById.get(id) || '';

    const reviewResolved = action === 'APPROVED' || action === 'IGNORED';
    const txResolved =
      txStatus === 'MATCH_FOUND' ||
      txStatus === 'INSERTED' ||
      txStatus === 'IGNORED';

    if (!reviewResolved || !txResolved) return;

    archiveRows.push(row);
    deleteRows.push(index + 2);
  });

  if (!archiveRows.length) return 0;

  archiveSheet
    .getRange(archiveSheet.getLastRow() + 1, 1, archiveRows.length, lastCol)
    .setValues(archiveRows);

  deleteRows.reverse().forEach(function(rowNumber) {
    reviewSheet.deleteRow(rowNumber);
  });

  return archiveRows.length;
}

function familyFinancesEnsureReviewEditTrigger_(ss) {
  try {
    const handler = 'familyFinancesOnEdit';
    const exists = ScriptApp.getProjectTriggers().some(function(trigger) {
      return trigger.getHandlerFunction() === handler;
    });

    if (exists) return 'existing';

    ScriptApp.newTrigger(handler)
      .forSpreadsheet(ss)
      .onEdit()
      .create();

    return 'created';
  } catch (err) {
    // The existing 15-minute trigger must keep working even if trigger creation
    // is temporarily blocked. A later run can try again.
    return 'error: ' + String(err && err.message ? err.message : err);
  }
}

function familyFinancesOnEdit(e) {
  try {
    if (!e || !e.range) return;

    const ss = e.source;
    if (!ss || ss.getId() !== FAMILY_FINANCES_TEST_SHEET_ID) return;

    const sheet = e.range.getSheet();
    if (!sheet) return;

    // Dashboard one-click sync checkbox.
    if (
      sheet.getName() === FAMILY_FINANCES_SYNC_BUTTON_SHEET &&
      e.range.getA1Notation() === FAMILY_FINANCES_SYNC_BUTTON_CELL &&
      String(e.value || '').trim().toUpperCase() === 'TRUE'
    ) {
      // Reset immediately so it behaves like a push button.
      e.range.setValue(false);
      ss.toast('Sync started…', 'Family Finances', 5);
      runFamilyFinancesSheetSync(true);
      return;
    }

    // Dashboard behind-the-scenes Plaid bank refresh checkbox.
    if (
      sheet.getName() === FAMILY_FINANCES_SYNC_BUTTON_SHEET &&
      e.range.getA1Notation() === FAMILY_FINANCES_REFRESH_BUTTON_CELL &&
      String(e.value || '').trim().toUpperCase() === 'TRUE'
    ) {
      e.range.setValue(false);
      ss.toast('Requesting a fresh Plaid bank check…', 'Refresh Banks', 6);
      familyFinancesRequestPlaidRefresh_();
      return;
    }

    if (sheet.getName() !== 'Plaid_Review') return;

    // Action column H only.
    if (e.range.getColumn() !== 8 || e.range.getNumColumns() !== 1) return;

    const action = String(e.value || '').trim().toUpperCase();
    if (action !== 'APPROVE' && action !== 'IGNORE') return;

    runFamilyFinancesSheetSync(true);
  } catch (err) {
    const ss = familyFinancesSpreadsheet_();
    const logSheet = ss.getSheetByName('Sync_Log');

    if (logSheet) {
      familyFinancesAppendLog_(logSheet, [
        new Date(),
        'Family Finances Review Edit',
        '',
        'Error',
        String(err && err.message ? err.message : err)
      ]);
    }
  }
}

function authorizeFamilyFinancesBankRefresh() {
  // Harmless one-time authorization helper. This does NOT call Plaid and does
  // NOT consume a paid refresh. It only grants Apps Script permission to make
  // the behind-the-scenes HTTPS request used by the dashboard checkbox.
  ScriptApp.getOAuthToken();
  const response = UrlFetchApp.fetch('https://smart-money-tracker-09ks.onrender.com/api/health', {
    method: 'get',
    muteHttpExceptions: true
  });

  const ss = familyFinancesSpreadsheet_();
  ss.toast(
    'Authorization is ready. The Refresh Banks checkbox can now run behind the scenes.',
    'Refresh Banks',
    8
  );

  return response.getResponseCode();
}


function familyFinancesRequestPlaidRefresh_() {
  const ss = familyFinancesSpreadsheet_();

  if (ss.getId() !== FAMILY_FINANCES_TEST_SHEET_ID) {
    throw new Error('Plaid bank refresh is locked to the TEST spreadsheet.');
  }

  const response = UrlFetchApp.fetch(FAMILY_FINANCES_REFRESH_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Sheet-Refresh-Token': 'ljS2LrFzKEk_iz-Cau29fJboVpoxBpU_G7QPDBHaNr4'
    },
    payload: JSON.stringify({
      spreadsheetId: FAMILY_FINANCES_TEST_SHEET_ID
    }),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body = response.getContentText();
  let data = {};

  try {
    data = body ? JSON.parse(body) : {};
  } catch (parseErr) {
    data = {};
  }

  if (status >= 200 && status < 300 && data.success !== false) {
    const refreshed = Number(data.refreshed_count || 0);
    const total = Number(data.total_count || 0);
    const detail = total
      ? 'Plaid refresh requested for ' + refreshed + ' of ' + total +
        ' bank connection(s). New activity normally arrives within a few minutes.'
      : 'Plaid refresh requested. New activity normally arrives within a few minutes.';

    ss.toast(detail, 'Refresh Banks', 10);
    return data;
  }

  if (status === 429 && data.cooldown) {
    const seconds = Number(data.retryAfterSeconds || 0);
    const detail = seconds
      ? 'A bank refresh was already requested. Try again in about ' + seconds + ' seconds.'
      : 'A bank refresh was already requested recently.';
    ss.toast(detail, 'Refresh Banks', 8);
    return data;
  }

  const message = String(data.error || data.message || body || ('HTTP ' + status));
  throw new Error('Plaid bank refresh failed: ' + message);
}


function familyFinancesCountPendingApprovals_(reviewSheet) {
  if (!reviewSheet || reviewSheet.getLastRow() < 2) return 0;

  const actions = reviewSheet
    .getRange(2, 8, reviewSheet.getLastRow() - 1, 1)
    .getValues();

  return actions.reduce(function(count, row) {
    const action = String(row[0] || '').trim().toUpperCase();
    return count + (action === 'APPROVE' ? 1 : 0);
  }, 0);
}

function familyFinancesProcessApprovedReviews_(reviewSheet) {
  const approvalCount = familyFinancesCountPendingApprovals_(reviewSheet);

  if (!approvalCount) {
    return {
      approvalsFound: 0,
      pipelineRan: false
    };
  }

  const requiredFunctions = [
    ['approveReviewedTransactions', typeof approveReviewedTransactions],
    ['dryRunMatchExistingMonthlyRows', typeof dryRunMatchExistingMonthlyRows],
    ['dryRunFindDateOrderRowsForReadyToInsert', typeof dryRunFindDateOrderRowsForReadyToInsert],
    ['insertReadyToInsertTransactionsByDateOrder', typeof insertReadyToInsertTransactionsByDateOrder]
  ];

  const missing = requiredFunctions
    .filter(function(item) { return item[1] !== 'function'; })
    .map(function(item) { return item[0]; });

  if (missing.length) {
    throw new Error(
      'Approved-review automation is missing required Code.gs function(s): ' +
      missing.join(', ')
    );
  }

  // One user decision should finish the safe pipeline:
  // APPROVE -> READY -> existing-row check -> date-order plan -> INSERTED.
  approveReviewedTransactions();
  dryRunMatchExistingMonthlyRows();
  dryRunFindDateOrderRowsForReadyToInsert();
  insertReadyToInsertTransactionsByDateOrder();

  return {
    approvalsFound: approvalCount,
    pipelineRan: true
  };
}

function runFamilyFinancesSheetSync(processReviewQueue) {
  processReviewQueue = processReviewQueue === true;
  const ss = familyFinancesSpreadsheet_();

  if (ss.getId() !== FAMILY_FINANCES_TEST_SHEET_ID) {
    throw new Error('Family Finances sync is locked to the TEST spreadsheet.');
  }

  SpreadsheetApp.setActiveSpreadsheet(ss);

  const txSheet = ss.getSheetByName('Plaid_Transactions');
  const reviewSheet = ss.getSheetByName('Plaid_Review');
  const logSheet = ss.getSheetByName('Sync_Log');

  if (!txSheet) throw new Error('Plaid_Transactions sheet not found.');
  if (!reviewSheet) throw new Error('Plaid_Review sheet not found.');
  if (!logSheet) throw new Error('Sync_Log sheet not found.');

  const started = new Date();
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  let fresh = 0;
  let cleared = 0;
  let alreadyEntered = 0;
  let queued = 0;
  let pending = 0;
  let skipped = 0;
  let closedReview = 0;
  let approvalsProcessed = 0;
  let ignoresProcessed = 0;
  let repairedMonthTabs = 0;
  let recoveredApprovals = 0;
  let archivedReview = 0;
  let readyRecovered = 0;
  let legacyPendingRecovered = 0;
  let collisionRepair = { repairedMarkers: 0, reprocessed: 0 };
  let postedPendingRecovered = 0;
  let reviewEditTrigger = 'not checked';

  try {
    const autoUpdateMatched = familyFinancesSetting_('Auto Update Matched Rows', true);
    const autoInsertConfident = familyFinancesSetting_('Auto Insert Confident New Transactions', true);
    const reviewMixedMerchants = familyFinancesSetting_('Review Mixed Merchants', true);

    // Recover transactions stranded by the legacy proposed-row pipeline before
    // processing newly imported bank activity.
    readyRecovered = familyFinancesRecoverReadyToInsert_(ss, txSheet);

    // Repair bad legacy marker associations before any pending recovery.
    // This specifically prevents a prior wrong marker from overriding the
    // exact-amount protections now used by the pending matcher.
    collisionRepair = familyFinancesRepairPendingMarkerCollisions_(ss, txSheet);

    // One-time catch-up for pending rows stranded by the old pay-cycle planner.
    // Each legacy failure is stamped after this attempt so normal 15-minute
    // syncs do not churn the same row forever.
    legacyPendingRecovered = familyFinancesRecoverLegacyPending_(ss, txSheet);

    // Resolve posted replacements against the exact pending transaction they
    // replaced. This safely removes many Amazon/Walmart/etc. items from Review.
    postedPendingRecovered = familyFinancesRecoverPostedFromPending_(ss, txSheet);

    const lastRow = txSheet.getLastRow();

    if (lastRow >= 2) {
      const txValues = txSheet.getRange(2, 1, lastRow - 1, 11).getValues();
      const existingReviewIds = familyFinancesExistingReviewIds_(reviewSheet);

      for (let i = 0; i < txValues.length; i++) {
        const row = txValues[i];
        const sheetRow = i + 2;

        if (!familyFinancesIsFreshImport_(row)) continue;

        fresh++;

        const transactionId = String(row[0]);
        const dateValue = row[1];
        const originalMerchant = String(row[2] || '').trim();
        const amount = Number(row[3]);
        const bank = String(row[4] || '').trim();
        const currentCategory = String(row[5] || '').trim();
        const pendingValue = row[6];
        const originalNotes = String(row[10] || '');

        if (!(dateValue instanceof Date) || isNaN(dateValue.getTime()) || !Number.isFinite(amount)) {
          txSheet.getRange(sheetRow, 11).setValue(
            familyFinancesAppendMarker_(originalNotes, 'queued for review; invalid date or amount.')
          );
          queued += familyFinancesQueueReview_(
            reviewSheet,
            existingReviewIds,
            transactionId,
            dateValue,
            originalMerchant,
            row[3],
            bank,
            currentCategory || 'Needs Review',
            '',
            'New bank transaction - invalid date or amount',
            originalNotes
          ) ? 1 : 0;
          continue;
        }

        const monthlyTab = familyFinancesMonthTabName_(dateValue);
        familyFinancesSetPlainText_(txSheet.getRange(sheetRow, 9), monthlyTab);

        const monthSheet = ss.getSheetByName(monthlyTab);
        const suggestion = familyFinancesMerchantSuggestion_(
          ss,
          originalMerchant,
          currentCategory
        );

        if (familyFinancesIsPending_(pendingValue)) {
          const pendingForecast = familyFinancesInsertPendingForecast_(
            ss,
            monthSheet,
            transactionId,
            dateValue,
            suggestion.merchant || originalMerchant,
            amount,
            bank,
            suggestion.category || 'Needs Review'
          );

          if (suggestion.merchant && suggestion.merchant !== originalMerchant) {
            txSheet.getRange(sheetRow, 3).setValue(suggestion.merchant);
          }
          if (suggestion.category) {
            txSheet.getRange(sheetRow, 6).setValue(suggestion.category);
          }

          if (pendingForecast.inserted || pendingForecast.existing) {
            txSheet.getRange(sheetRow, 10).setValue(pendingForecast.rowNumber);
            txSheet.getRange(sheetRow, 11).setValue(
              familyFinancesAppendMarker_(
                originalNotes,
                (pendingForecast.existing
                  ? 'pending bank item already represented'
                  : 'pending bank item added') +
                ' in monthly Forecast column C at ' +
                monthlyTab + ' row ' + pendingForecast.rowNumber +
                '; Actual column D left blank until posting.'
              )
            );
          } else {
            txSheet.getRange(sheetRow, 11).setValue(
              familyFinancesAppendMarker_(
                originalNotes,
                'pending bank item could not be added to forecast: ' +
                pendingForecast.reason + '; wait for posting.'
              )
            );
          }

          pending++;
          continue;
        }

        // Posted replacements are safest when Plaid tells us exactly which
        // pending transaction they replaced. This works even for mixed
        // merchants such as Amazon/Walmart because identity comes from the
        // predecessor pending ID, while amount + bank still must match.
        const pendingSourceId = familyFinancesPendingSourceIdFromNotes_(originalNotes);

        if (pendingSourceId && monthSheet) {
          const postedPendingResult = familyFinancesResolvePostedFromPending_(
            monthSheet,
            transactionId,
            pendingSourceId,
            amount,
            bank,
            suggestion.category
          );

          if (postedPendingResult.status === 'ONE') {
            const matchedRow = postedPendingResult.rowNumber;
            const matchedCategory = String(
              monthSheet.getRange(matchedRow, 6).getValue() || ''
            ).trim();

            if (matchedCategory) {
              txSheet.getRange(sheetRow, 6).setValue(matchedCategory);
            }

            txSheet.getRange(sheetRow, 8, 1, 3).setValues([[
              'MATCH_FOUND',
              monthlyTab,
              matchedRow
            ]]);

            txSheet.getRange(sheetRow, 11).setValue(
              familyFinancesAppendMarker_(
                originalNotes,
                'posted replacement cleared ' + monthlyTab +
                ' row ' + matchedRow +
                ' using exact predecessor pending marker + exact amount + bank.'
              )
            );

            cleared++;
            continue;
          }
        }

        // First, protect rows Steve already entered manually. This check is
        // intentionally merchant-agnostic: bank memos and Steve's descriptions
        // can be very different. Exact bank + exact cleared amount + a tight
        // posting-date window is enough when there is only one candidate.
        let exactEnteredResult = { status: 'NONE', candidates: [] };

        if (monthSheet) {
          exactEnteredResult = familyFinancesFindExactBankAmountDateCandidate_(
            monthSheet,
            dateValue,
            amount,
            bank
          );
        }

        if (exactEnteredResult.status === 'ONE') {
          const candidate = exactEnteredResult.candidates[0];
          const matchedCategory = String(candidate.values[5] || '').trim();

          if (matchedCategory) {
            txSheet.getRange(sheetRow, 6).setValue(matchedCategory);
          }

          txSheet.getRange(sheetRow, 8, 1, 3).setValues([[
            'MATCH_FOUND',
            monthlyTab,
            candidate.rowNumber
          ]]);

          txSheet.getRange(sheetRow, 11).setValue(
            familyFinancesAppendMarker_(
              originalNotes,
              'already entered in ' + monthlyTab + ' row ' + candidate.rowNumber +
              ' by exact bank + exact cleared amount within 4 days; merchant wording was not required; no monthly amount changed.'
            )
          );

          alreadyEntered++;
          continue;
        }

        // Keep known mixed merchants out of automatic clearing only after the
        // exact already-entered check above. This prevents Walmart/Target/Sam's
        // from duplicating rows Steve already entered himself.
        const isMixed = reviewMixedMerchants && familyFinancesIsMixedMerchant_(originalMerchant);

        let plannedResult = { status: 'NONE', candidates: [] };
        let candidateResult = { status: 'NONE', candidates: [] };

        if (!isMixed && monthSheet) {
          plannedResult = familyFinancesFindPlannedCandidate_(
            ss,
            monthSheet,
            dateValue,
            originalMerchant,
            amount,
            bank
          );
        }

        if (
          autoUpdateMatched &&
          !isMixed &&
          plannedResult.status === 'ONE'
        ) {
          const candidate = plannedResult.candidates[0];
          const actual = candidate.values[3];
          const matchedCategory = String(candidate.values[5] || '').trim();

          if (matchedCategory) {
            txSheet.getRange(sheetRow, 6).setValue(matchedCategory);
          }

          if (actual === '' || actual === null) {
            // Column D only. Column C forecast is never changed.
            monthSheet.getRange(candidate.rowNumber, 4).setValue(amount);

            txSheet.getRange(sheetRow, 8, 1, 3).setValues([[
              'MATCH_FOUND',
              monthlyTab,
              candidate.rowNumber
            ]]);

            let sourceText = candidate.source;
            if (candidate.affirmPlan) {
              sourceText +=
                ' (' + candidate.affirmPlan.planId +
                ' / ' + candidate.affirmPlan.merchant + ')';
            }

            txSheet.getRange(sheetRow, 11).setValue(
              familyFinancesAppendMarker_(
                originalNotes,
                'planned row cleared in ' + monthlyTab +
                ' row ' + candidate.rowNumber +
                ' using ' + sourceText +
                '; forecast preserved.'
              )
            );

            cleared++;
            continue;
          }

          if (familyFinancesAmountsEqual_(actual, amount)) {
            txSheet.getRange(sheetRow, 8, 1, 3).setValues([[
              'MATCH_FOUND',
              monthlyTab,
              candidate.rowNumber
            ]]);

            txSheet.getRange(sheetRow, 11).setValue(
              familyFinancesAppendMarker_(
                originalNotes,
                'planned monthly row already has the exact cleared amount in ' +
                monthlyTab + ' row ' + candidate.rowNumber + '.'
              )
            );

            alreadyEntered++;
            continue;
          }
        }

        if (!isMixed && monthSheet) {
          candidateResult = familyFinancesFindVerifiedCandidate_(
            monthSheet,
            dateValue,
            originalMerchant,
            amount,
            bank
          );
        }

        if (
          autoUpdateMatched &&
          !isMixed &&
          candidateResult.status === 'ONE'
        ) {
          const candidate = candidateResult.candidates[0];
          const actual = candidate.values[3];

          if (actual === '') {
            // Column D only. Column C forecast is never changed.
            monthSheet.getRange(candidate.rowNumber, 4).setValue(amount);

            txSheet.getRange(sheetRow, 8, 1, 3).setValues([[
              'MATCH_FOUND',
              monthlyTab,
              candidate.rowNumber
            ]]);

            txSheet.getRange(sheetRow, 11).setValue(
              familyFinancesAppendMarker_(
                originalNotes,
                'verified existing row cleared in ' + monthlyTab +
                ' row ' + candidate.rowNumber + '; forecast preserved.'
              )
            );

            cleared++;
            continue;
          }

          if (Number(actual) === amount) {
            txSheet.getRange(sheetRow, 8, 1, 3).setValues([[
              'MATCH_FOUND',
              monthlyTab,
              candidate.rowNumber
            ]]);

            txSheet.getRange(sheetRow, 11).setValue(
              familyFinancesAppendMarker_(
                originalNotes,
                'existing monthly cleared amount already matches bank transaction in ' +
                monthlyTab + ' row ' + candidate.rowNumber + '.'
              )
            );

            alreadyEntered++;
            continue;
          }
        }

        // Fallback for manually-entered rows whose bank posting date/description differs
        // from the wording used in the monthly sheet. This is intentionally conservative:
        // same monthly tab + exact bank + exact actual amount + strong merchant similarity.
        // Mixed merchants stay in review.
        let alreadyEnteredResult = { status: 'NONE', candidates: [] };

        if (!isMixed && monthSheet) {
          alreadyEnteredResult = familyFinancesFindAlreadyEnteredCandidate_(
            monthSheet,
            originalMerchant,
            amount,
            bank
          );
        }

        if (!isMixed && alreadyEnteredResult.status === 'ONE') {
          const candidate = alreadyEnteredResult.candidates[0];
          const matchedCategory = String(candidate.values[5] || '').trim();

          if (matchedCategory) {
            txSheet.getRange(sheetRow, 6).setValue(matchedCategory);
          }

          txSheet.getRange(sheetRow, 8, 1, 3).setValues([[
            'MATCH_FOUND',
            monthlyTab,
            candidate.rowNumber
          ]]);

          txSheet.getRange(sheetRow, 11).setValue(
            familyFinancesAppendMarker_(
              originalNotes,
              'already entered in ' + monthlyTab + ' row ' + candidate.rowNumber +
              ' by exact bank + exact actual amount + merchant similarity; no monthly amount changed.'
            )
          );

          alreadyEntered++;
          continue;
        }

        // A genuinely new, posted, ordinary expense can now complete the same
        // approval/insertion pipeline automatically. We still refuse to guess
        // when there is any possible monthly match, an ambiguous merchant, a
        // positive amount, or a category with transfer/debt/income semantics.
        if (
          autoInsertConfident &&
          familyFinancesShouldAutoInsert_(
            suggestion.merchant || originalMerchant,
            suggestion.category,
            amount,
            monthSheet,
            [
              exactEnteredResult,
              plannedResult,
              candidateResult,
              alreadyEnteredResult
            ]
          )
        ) {
          if (suggestion.merchant && suggestion.merchant !== originalMerchant) {
            txSheet.getRange(sheetRow, 3).setValue(suggestion.merchant);
          }
          txSheet.getRange(sheetRow, 6).setValue(suggestion.category);

          const writeResult = familyFinancesWriteMonthlyTransaction_(
            monthSheet,
            transactionId,
            dateValue,
            suggestion.merchant || originalMerchant,
            amount,
            bank,
            suggestion.category,
            false
          );

          if (writeResult.inserted) {
            txSheet.getRange(sheetRow, 8, 1, 3).setValues([[
              'INSERTED',
              monthlyTab,
              writeResult.rowNumber
            ]]);
            txSheet.getRange(sheetRow, 11).setValue(
              familyFinancesAppendMarker_(
                originalNotes,
                'auto-inserted posted transaction directly into monthly row ' +
                writeResult.rowNumber +
                '; legacy proposed-row pipeline bypassed.'
              )
            );
          } else {
            const added = familyFinancesQueueReview_(
              reviewSheet,
              existingReviewIds,
              transactionId,
              dateValue,
              suggestion.merchant || originalMerchant,
              amount,
              bank,
              suggestion.category,
              monthlyTab,
              'Automatic monthly write failed: ' + writeResult.reason,
              originalNotes
            );
            if (added) queued++;
            else skipped++;
          }

          continue;
        }

        let reason = 'New bank transaction - review category/match';

        if (isMixed) {
          reason = 'Mixed merchant - review required before monthly update';
        } else if (!monthSheet) {
          reason = 'Monthly tab not found - review required';
        } else if (plannedResult.status === 'MULTIPLE') {
          reason = 'Multiple planned monthly matches - review required';
        } else if (candidateResult.status === 'MULTIPLE') {
          reason = 'Multiple possible monthly matches - review required';
        } else if (exactEnteredResult.status === 'MULTIPLE') {
          reason = 'Multiple exact bank/amount/date monthly matches - review required';
        } else if (alreadyEnteredResult.status === 'MULTIPLE') {
          reason = 'Multiple already-entered monthly matches - review required';
        } else if (candidateResult.status === 'ONE' && !autoUpdateMatched) {
          reason = 'Verified match found, but Auto Update Matched Rows is disabled';
        } else if (candidateResult.status === 'ONE') {
          reason = 'Possible monthly match already has a different cleared amount';
        }

        if (suggestion.merchant && suggestion.merchant !== originalMerchant) {
          txSheet.getRange(sheetRow, 3).setValue(suggestion.merchant);
        }
        if (suggestion.category) {
          txSheet.getRange(sheetRow, 6).setValue(suggestion.category);
        }

        const added = familyFinancesQueueReview_(
          reviewSheet,
          existingReviewIds,
          transactionId,
          dateValue,
          suggestion.merchant || originalMerchant,
          amount,
          bank,
          suggestion.category || 'Needs Review',
          monthlyTab,
          reason,
          originalNotes
        );

        if (added) queued++;
        else skipped++;

        txSheet.getRange(sheetRow, 11).setValue(
          familyFinancesAppendMarker_(originalNotes, 'queued for review; ' + reason)
        );
      }
    }

    // Monthly-tab repair is intentionally disabled during routine sync.
    // New writes are already forced to plain text, and touching legacy rows here
    // can trip stale validation rules from older workbook versions.
    const repairRun = { repaired: 0, recoveredApprovals: 0 };
    repairedMonthTabs = 0;
    recoveredApprovals = 0;

    // If Steve has chosen a category and set Action=IGNORE, finish that decision
    // automatically too.
    if (processReviewQueue) {
    ignoresProcessed = familyFinancesProcessIgnoredReviews_(reviewSheet);

    // If Steve has chosen a category and set Action=APPROVE, finish the rest
    // of the safe pipeline automatically instead of requiring menu clicks.
    const approvalRun = familyFinancesProcessApprovedReviews_(reviewSheet);
    approvalsProcessed = approvalRun.approvalsFound;

    // Reconcile stale Plaid_Review rows after matching/insertion. This also
    // cleans up older review entries that were created before the matcher
    // learned how to resolve them automatically.
    closedReview = familyFinancesCloseResolvedReviews_(txSheet, reviewSheet);

    // Keep Plaid_Review as an active work queue instead of a history dump.
    archivedReview = familyFinancesArchiveResolvedReviews_(ss, txSheet, reviewSheet);

    // One-time self-install: the existing 15-minute trigger will create the
    // review onEdit trigger after this code is pasted. After that, choosing
    // APPROVE or IGNORE runs the workflow immediately from the sheet.
    reviewEditTrigger = familyFinancesEnsureReviewEditTrigger_(ss);
    } else {
      ignoresProcessed = 0;
      approvalsProcessed = 0;
      closedReview = 0;
      archivedReview = 0;
      reviewEditTrigger = 'skipped';
    }

    const seconds = Math.round((Date.now() - started.getTime()) / 1000);
    const details =
      'Incremental sync complete in ' + seconds + 's. ' +
      'Fresh: ' + fresh + '. ' +
      'Auto-cleared: ' + cleared + '. ' +
      'Already entered: ' + alreadyEntered + '. ' +
      'Queued review: ' + queued + '. ' +
      'Pending: ' + pending + '. ' +
      'Duplicate review skipped: ' + skipped + '. ' +
      'Approved reviews processed: ' + approvalsProcessed + '. ' +
      'Ignored reviews processed: ' + ignoresProcessed + '. ' +
      'Repaired month tabs: ' + repairedMonthTabs + '. ' +
      'Recovered approvals: ' + recoveredApprovals + '. ' +
      'Recovered READY_TO_INSERT: ' + readyRecovered + '. ' +
      'Recovered legacy pending: ' + legacyPendingRecovered + '. ' +
      'Repaired pending markers: ' + collisionRepair.repairedMarkers + '. ' +
      'Reprocessed collision rows: ' + collisionRepair.reprocessed + '. ' +
      'Recovered posted-from-pending: ' + postedPendingRecovered + '. ' +
      'Closed stale review: ' + closedReview + '. ' +
      'Archived resolved review: ' + archivedReview + '. ' +
      'Review edit trigger: ' + reviewEditTrigger + '. ' +
      'Historical backlog was not reprocessed.';

    familyFinancesAppendLog_(logSheet, [
      new Date(),
      'Family Finances Incremental Sync',
      '',
      'Complete',
      details
    ]);

    ss.toast(details, 'Family Finances Sync', 10);

    return {
      fresh: fresh,
      cleared: cleared,
      alreadyEntered: alreadyEntered,
      queued: queued,
      pending: pending,
      skipped: skipped,
      approvalsProcessed: approvalsProcessed,
      ignoresProcessed: ignoresProcessed,
      repairedMonthTabs: repairedMonthTabs,
      recoveredApprovals: recoveredApprovals,
      readyRecovered: readyRecovered,
      legacyPendingRecovered: legacyPendingRecovered,
      collisionRepair: collisionRepair,
      postedPendingRecovered: postedPendingRecovered,
      closedReview: closedReview,
      archivedReview: archivedReview,
      reviewEditTrigger: reviewEditTrigger
    };
  } catch (err) {
    familyFinancesAppendLog_(logSheet, [
      new Date(),
      'Family Finances Incremental Sync',
      '',
      'Error',
      String(err && err.message ? err.message : err)
    ]);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function runFamilyFinancesScheduledSync() {
  // Time-based/on-open automation must complete the review pipeline too.
  // This keeps TEST unattended: fresh imports are matched, safe auto-approved
  // transactions are inserted, and approved review items are finalized.
  return runFamilyFinancesSheetSync(true);
}

function installFamilyFinancesSheetSyncTriggers() {
  const ss = familyFinancesSpreadsheet_();

  if (ss.getId() !== FAMILY_FINANCES_TEST_SHEET_ID) {
    throw new Error('Trigger install is locked to the TEST spreadsheet.');
  }

  const handlers = new Set([
    'runFamilyFinancesSheetSync',
    'runFamilyFinancesScheduledSync',
    'familyFinancesOnEdit'
  ]);

  ScriptApp.getProjectTriggers()
    .filter(function(trigger) {
      return handlers.has(trigger.getHandlerFunction());
    })
    .forEach(function(trigger) {
      ScriptApp.deleteTrigger(trigger);
    });

  ScriptApp.newTrigger('runFamilyFinancesScheduledSync')
    .timeBased()
    .everyMinutes(15)
    .create();

  ScriptApp.newTrigger('runFamilyFinancesScheduledSync')
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  ScriptApp.newTrigger('familyFinancesOnEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  const logSheet = ss.getSheetByName('Sync_Log');

  if (logSheet) {
    familyFinancesAppendLog_(logSheet, [
      new Date(),
      'Install Family Finances Sync Triggers',
      '',
      'Complete',
      'Installed 15-minute, spreadsheet-open, and Plaid_Review edit triggers for the TEST workbook.'
    ]);
  }

  ss.toast(
    'Installed TEST sync triggers: every 15 minutes + workbook open + review APPROVE/IGNORE.',
    'Family Finances Sync',
    10
  );
}

function removeFamilyFinancesSheetSyncTriggers() {
  const handlers = new Set([
    'runFamilyFinancesSheetSync',
    'runFamilyFinancesScheduledSync'
  ]);
  let removed = 0;

  ScriptApp.getProjectTriggers()
    .filter(function(trigger) {
      return handlers.has(trigger.getHandlerFunction());
    })
    .forEach(function(trigger) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    });

  const ss = familyFinancesSpreadsheet_();
  const logSheet = ss.getSheetByName('Sync_Log');

  if (logSheet) {
    familyFinancesAppendLog_(logSheet, [
      new Date(),
      'Remove Family Finances Sync Triggers',
      '',
      'Complete',
      'Removed ' + removed + ' Family Finances sync trigger(s).'
    ]);
  }

  ss.toast(
    'Removed ' + removed + ' Family Finances sync trigger(s).',
    'Family Finances Sync',
    8
  );
}
