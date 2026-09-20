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
 * - everything else is queued once in Plaid_Review
 * - no new monthly rows are inserted
 *
 * This prevents the 15-minute job from re-processing the historical backlog.
 */

const FAMILY_FINANCES_TEST_SHEET_ID = '1qaaf0t9il726oQpL2oXMbZqlF7zJpHomsClk8vklE_g';
const FAMILY_FINANCES_SYNC_MARKER = 'Family Finances sync:';

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
  const notes = String(row[10] || '');

  return Boolean(id) &&
    status === 'REVIEW' &&
    notes.toLowerCase().includes('imported for review') &&
    !notes.toLowerCase().includes(FAMILY_FINANCES_SYNC_MARKER.toLowerCase());
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
    'sams club'
  ];

  return mixed.some(function(term) {
    return name.includes(term);
  });
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
    "'" + monthlyTab,
    originalNotes || ''
  ]);

  existingReviewIds.add(String(transactionId));
  return true;
}

function runFamilyFinancesSheetSync() {
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

  try {
    const autoUpdateMatched = familyFinancesSetting_('Auto Update Matched Rows', true);
    const reviewMixedMerchants = familyFinancesSetting_('Review Mixed Merchants', true);

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
        txSheet.getRange(sheetRow, 9).setValue(monthlyTab);

        if (familyFinancesIsPending_(pendingValue)) {
          txSheet.getRange(sheetRow, 11).setValue(
            familyFinancesAppendMarker_(originalNotes, 'pending bank item; wait for posting.')
          );
          pending++;
          continue;
        }

        const suggestion = familyFinancesMerchantSuggestion_(
          ss,
          originalMerchant,
          currentCategory
        );

        // Keep known mixed merchants out of automatic clearing.
        const isMixed = reviewMixedMerchants && familyFinancesIsMixedMerchant_(originalMerchant);
        const monthSheet = ss.getSheetByName(monthlyTab);

        let candidateResult = { status: 'NONE', candidates: [] };

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

        let reason = 'New bank transaction - review category/match';

        if (isMixed) {
          reason = 'Mixed merchant - review required before monthly update';
        } else if (!monthSheet) {
          reason = 'Monthly tab not found - review required';
        } else if (candidateResult.status === 'MULTIPLE') {
          reason = 'Multiple possible monthly matches - review required';
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

    const seconds = Math.round((Date.now() - started.getTime()) / 1000);
    const details =
      'Incremental sync complete in ' + seconds + 's. ' +
      'Fresh: ' + fresh + '. ' +
      'Auto-cleared: ' + cleared + '. ' +
      'Already entered: ' + alreadyEntered + '. ' +
      'Queued review: ' + queued + '. ' +
      'Pending: ' + pending + '. ' +
      'Duplicate review skipped: ' + skipped + '. ' +
      'Historical backlog was not reprocessed.';

    logSheet.appendRow([
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
      skipped: skipped
    };
  } catch (err) {
    logSheet.appendRow([
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

function installFamilyFinancesSheetSyncTriggers() {
  const ss = familyFinancesSpreadsheet_();

  if (ss.getId() !== FAMILY_FINANCES_TEST_SHEET_ID) {
    throw new Error('Trigger install is locked to the TEST spreadsheet.');
  }

  const handler = 'runFamilyFinancesSheetSync';

  ScriptApp.getProjectTriggers()
    .filter(function(trigger) {
      return trigger.getHandlerFunction() === handler;
    })
    .forEach(function(trigger) {
      ScriptApp.deleteTrigger(trigger);
    });

  ScriptApp.newTrigger(handler)
    .timeBased()
    .everyMinutes(15)
    .create();

  ScriptApp.newTrigger(handler)
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  const logSheet = ss.getSheetByName('Sync_Log');

  if (logSheet) {
    logSheet.appendRow([
      new Date(),
      'Install Family Finances Sync Triggers',
      '',
      'Complete',
      'Installed 15-minute time trigger and spreadsheet-open catch-up trigger for the TEST workbook.'
    ]);
  }

  ss.toast(
    'Installed TEST sync triggers: every 15 minutes + when the workbook opens.',
    'Family Finances Sync',
    10
  );
}

function removeFamilyFinancesSheetSyncTriggers() {
  const handler = 'runFamilyFinancesSheetSync';
  let removed = 0;

  ScriptApp.getProjectTriggers()
    .filter(function(trigger) {
      return trigger.getHandlerFunction() === handler;
    })
    .forEach(function(trigger) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    });

  const ss = familyFinancesSpreadsheet_();
  const logSheet = ss.getSheetByName('Sync_Log');

  if (logSheet) {
    logSheet.appendRow([
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
