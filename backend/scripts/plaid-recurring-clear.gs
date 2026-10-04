/**
 * Add this file to the TEST spreadsheet's existing Apps Script project.
 * It never creates monthly rows or changes a forecast. Only an explicit apply
 * writes the cleared bank amount into column D on an unambiguous existing row.
 */
const PLAID_CLEARING_TEST_SHEET_ID = '1qaaf0t9il726oQpL2oXMbZqlF7zJpHomsClk8vklE_g';
function previewPlaidRecurringClears() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getId() !== PLAID_CLEARING_TEST_SHEET_ID) throw new Error('This clearing test can only run in the TEST spreadsheet');
  const source = ss.getSheetByName('Plaid_Transactions');
  if (!source) throw new Error('Plaid_Transactions is missing');
  const preview = ss.getSheetByName('Plaid_Clearing_Preview') || ss.insertSheet('Plaid_Clearing_Preview');
  const sourceRows = source.getRange(2, 1, Math.max(1, source.getLastRow() - 1), 11).getValues();
  const output = [['Bank date', 'Bank', 'Bank description', 'Bank amount', 'Monthly tab', 'Monthly row', 'Planned description', 'Forecasted', 'Already entered', 'Finding', 'Transaction ID']];
  const monthCache = new Map();
  for (let i = 0; i < sourceRows.length; i++) {
    const [id, date, merchant, amount, bank, , pending, status] = sourceRows[i];
    if (!id || String(status).trim().toUpperCase() !== 'REVIEW') continue;
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      output.push([date, bank, merchant, amount, '', '', '', '', '', 'REVIEW: invalid date', id]);
      continue;
    }
    const month = formatPlaidMonthTabName_(date);
    const sheet = ss.getSheetByName(month);
    if (!sheet) {
      output.push([date, bank, merchant, amount, month, '', '', '', '', 'REVIEW: monthly tab missing', id]);
      continue;
    }
    if (!monthCache.has(month)) monthCache.set(month, sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 6).getValues());
    const bankDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const exactName = String(merchant).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const candidates = [];
    monthCache.get(month).forEach((row, j) => {
      const [rowDate, rowName, planned, actual, rowBank] = row;
      if (!(rowDate instanceof Date) || String(rowBank).trim().toLowerCase() !== String(bank).trim().toLowerCase()) return;
      const rowDay = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate()).getTime();
      if (bankDay !== rowDay || !rowName) return;
      const name = String(rowName).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (name !== exactName) return;
      candidates.push({ row: j + 2, name: rowName, planned, actual });
    });
    let choice = null;
    let finding = 'REVIEW: no exact bank/date/description match';
    if (pending === true || String(pending).toUpperCase() === 'TRUE') finding = 'PENDING: wait for posting';
    else if (candidates.length > 1) finding = 'REVIEW: multiple exact matches';
    else if (candidates.length === 1) {
      choice = candidates[0];
      finding = choice.actual === '' ? 'READY: blank cleared amount' : 'REVIEW: cleared amount already entered';
    }
    output.push([date, bank, merchant, amount, month, choice ? choice.row : '', choice ? choice.name : '', choice ? choice.planned : '', choice ? choice.actual : '', finding, id]);
  }
  preview.clearContents();
  preview.getRange(1, 1, output.length, 11).setValues(output);
  preview.setFrozenRows(1);
  preview.getRange(2, 1, Math.max(1, output.length - 1), 1).setNumberFormat('mm/dd/yyyy');
  preview.getRange(2, 4, Math.max(1, output.length - 1), 1).setNumberFormat('$#,##0.00;[Red]($#,##0.00)');
  preview.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#eaf0f7');
  preview.setColumnWidth(1, 115); preview.setColumnWidth(2, 85); preview.setColumnWidth(3, 240);
  preview.setColumnWidth(4, 115); preview.setColumnWidth(5, 160); preview.setColumnWidth(6, 100);
  preview.setColumnWidth(7, 240); preview.setColumnWidth(8, 110); preview.setColumnWidth(9, 110);
  preview.setColumnWidth(10, 260); preview.hideColumns(11);
  ss.toast('Clearing preview updated. Monthly tabs were not changed.', 'Plaid clearing', 8);
}

function applyExactPlaidRecurringClears() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getId() !== PLAID_CLEARING_TEST_SHEET_ID) throw new Error('This clearing test can only run in the TEST spreadsheet');
  const staging = ss.getSheetByName('Plaid_Transactions');
  const preview = ss.getSheetByName('Plaid_Clearing_Preview');
  if (!staging || !preview) throw new Error('Run previewPlaidRecurringClears first');
  const staged = staging.getRange(2, 1, Math.max(1, staging.getLastRow() - 1), 11).getValues();
  const byId = new Map(staged.map((row, i) => [String(row[0]), { row, sheetRow: i + 2 }]));
  const proposals = preview.getRange(2, 1, Math.max(1, preview.getLastRow() - 1), 11).getValues();
  const targets = new Map();
  for (const proposal of proposals) {
    if (proposal[9] !== 'READY: blank cleared amount') continue;
    const key = `${proposal[4]}!${proposal[5]}`;
    targets.set(key, (targets.get(key) || 0) + 1);
  }
  let applied = 0, skipped = 0;
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    for (const p of proposals) {
      if (p[9] !== 'READY: blank cleared amount') continue;
      const key = `${p[4]}!${p[5]}`;
      const item = byId.get(String(p[10]));
      const month = ss.getSheetByName(String(p[4]));
      const rowNo = Number(p[5]);
      if (!item || targets.get(key) !== 1 || !month || !Number.isInteger(rowNo) || rowNo < 2) { skipped++; continue; }
      const tx = item.row;
      const live = month.getRange(rowNo, 1, 1, 6).getValues()[0];
      const sameDay = tx[1] instanceof Date && live[0] instanceof Date &&
        tx[1].getFullYear() === live[0].getFullYear() && tx[1].getMonth() === live[0].getMonth() && tx[1].getDate() === live[0].getDate();
      const norm = v => String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const okay = String(tx[7]).trim().toUpperCase() === 'REVIEW' && !tx[6] && sameDay &&
        norm(tx[2]) === norm(live[1]) && norm(tx[4]) === norm(live[4]) &&
        norm(tx[2]) === norm(p[2]) && String(tx[0]) === String(p[10]) &&
        live[3] === '' && Number.isFinite(Number(tx[3])) &&
        Number(tx[3]) === Number(p[3]) && norm(live[1]) === norm(p[6]);
      if (!okay) { skipped++; continue; }
      month.getRange(rowNo, 4).setValue(Number(tx[3]));
      staging.getRange(item.sheetRow, 8, 1, 3).setValues([['MATCH_FOUND', String(p[4]), rowNo]]);
      staging.getRange(item.sheetRow, 11).setValue(`${String(tx[10] || '')}; Cleared bank amount recorded in ${p[4]} row ${rowNo}; forecast preserved.`);
      applied++;
    }
  } finally { lock.releaseLock(); }
  ss.toast(`Updated ${applied} existing rows; skipped ${skipped}. Run preview again to refresh.`, 'Plaid clearing', 12);
}
