/**
 * Family Finances Sheet Sync - Phase 1
 *
 * Safe automation pass for the TEST workbook:
 * - runs the already-tested recurring clearing preview/apply
 * - preserves Column C forecast
 * - runs the existing safe Plaid workflow for everything else
 * - DOES NOT auto-insert READY_TO_INSERT transactions yet
 */

const FAMILY_FINANCES_TEST_SHEET_ID = '1qaaf0t9il726oQpL2oXMbZqlF7zJpHomsClk8vklE_g';

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

function familyFinancesOpenStatusCounts_() {
  const ss = familyFinancesSpreadsheet_();
  const txSheet = ss.getSheetByName('Plaid_Transactions');

  if (!txSheet || txSheet.getLastRow() < 2) {
    return { review: 0, ready: 0, pending: 0 };
  }

  const values = txSheet.getRange(2, 7, txSheet.getLastRow() - 1, 2).getValues();

  let review = 0;
  let ready = 0;
  let pending = 0;

  for (const row of values) {
    const pendingValue = row[0];
    const statusValue = row[1];

    const status = String(statusValue || '').trim().toUpperCase();
    const isPending =
      pendingValue === true ||
      String(pendingValue || '').trim().toUpperCase() === 'TRUE';

    if (isPending) pending++;
    if (status === 'REVIEW') review++;
    if (status === 'READY_TO_INSERT') ready++;
  }

  return { review: review, ready: ready, pending: pending };
}

function runFamilyFinancesSheetSync() {
  const ss = familyFinancesSpreadsheet_();

  if (ss.getId() !== FAMILY_FINANCES_TEST_SHEET_ID) {
    throw new Error('Family Finances sync is locked to the TEST spreadsheet.');
  }

  SpreadsheetApp.setActiveSpreadsheet(ss);

  const logSheet = ss.getSheetByName('Sync_Log');
  if (!logSheet) throw new Error('Sync_Log sheet not found.');

  const autoUpdateMatched = familyFinancesSetting_('Auto Update Matched Rows', true);
  const started = new Date();

  try {
    // Most conservative pass first:
    // only clear a bank transaction into an existing planned row
    // when the tested recurring matcher says it is unambiguous.
    previewPlaidRecurringClears();

    if (autoUpdateMatched) {
      applyExactPlaidRecurringClears();
      previewPlaidRecurringClears();
    }

    // Process everything left over using the existing SAFE workflow.
    // This can clean merchants, send mixed merchants to review,
    // honor user review choices, match existing monthly rows,
    // and prepare READY_TO_INSERT transactions.
    // It does NOT perform the actual new-row insert.
    if (typeof runSafePlaidWorkflow !== 'function') {
      throw new Error('runSafePlaidWorkflow() is missing from the Apps Script project.');
    }

    runSafePlaidWorkflow();

    const counts = familyFinancesOpenStatusCounts_();
    const seconds = Math.round((Date.now() - started.getTime()) / 1000);

    const details =
      'Safe sync complete in ' + seconds + 's. ' +
      'Open review: ' + counts.review + '. ' +
      'Ready to insert: ' + counts.ready + '. ' +
      'Pending bank items: ' + counts.pending + '. ' +
      'Automatic monthly insertion is intentionally OFF in Phase 1.';

    logSheet.appendRow([
      new Date(),
      'Family Finances Sheet Sync',
      '',
      'Complete',
      details
    ]);

    ss.toast(details, 'Family Finances Sync', 10);

    return counts;
  } catch (err) {
    logSheet.appendRow([
      new Date(),
      'Family Finances Sheet Sync',
      '',
      'Error',
      String(err && err.message ? err.message : err)
    ]);

    throw err;
  }
}

function installFamilyFinancesSheetSyncTriggers() {
  const ss = familyFinancesSpreadsheet_();

  if (ss.getId() !== FAMILY_FINANCES_TEST_SHEET_ID) {
    throw new Error('Trigger install is locked to the TEST spreadsheet.');
  }

  const handler = 'runFamilyFinancesSheetSync';

  // Idempotent installer: remove only our own old triggers.
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
