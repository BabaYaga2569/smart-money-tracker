import { SettingsSchemaManager } from './SettingsSchemaManager';
import {
  buildHouseholdPayEvents,
  summarizeNextHouseholdRefill,
  nextMainPaydayDate
} from './householdPayEvents';
import { visibleBillOccurrences } from './billVisibility';
import { formatDateForInput, getDaysUntilDateInPacific } from './DateUtils';
import { getPacificTime } from './timezoneHelpers';

const toDateOnly = value => String(value || '').slice(0, 10);

const addDaysToDateOnly = (value, days) => {
  const [year, month, day] = toDateOnly(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
};

export function normalizeFinancialSettings(rawSettings = {}) {
  let settings = rawSettings || {};

  if (!settings.schemaVersion || settings.schemaVersion < SettingsSchemaManager.CURRENT_SCHEMA_VERSION) {
    settings = SettingsSchemaManager.migrateSettings(settings);
  } else {
    settings = JSON.parse(JSON.stringify(settings));
  }

  settings = SettingsSchemaManager.ensureRequiredFields(settings);

  // Compatibility repair for documents that were stamped with a newer schema
  // version while still carrying legacy flat pay fields.
  settings.paySchedules = settings.paySchedules || {};
  settings.paySchedules.yours = settings.paySchedules.yours || {};
  settings.paySchedules.spouse = settings.paySchedules.spouse || {};

  if (!settings.paySchedules.yours.lastPaydate && rawSettings.lastPayDate) {
    settings.paySchedules.yours.lastPaydate = rawSettings.lastPayDate;
  }
  if (!(Number(settings.paySchedules.yours.amount) > 0) && Number(rawSettings.payAmount) > 0) {
    settings.paySchedules.yours.amount = Number(rawSettings.payAmount);
  }
  if (!(Number(settings.paySchedules.spouse.amount) > 0) && Number(rawSettings.spousePayAmount) > 0) {
    settings.paySchedules.spouse.amount = Number(rawSettings.spousePayAmount);
  }

  settings.paySchedules.yours.type = settings.paySchedules.yours.type || 'bi-weekly';
  settings.paySchedules.spouse.type = settings.paySchedules.spouse.type || 'bi-monthly';
  settings.paySchedules.spouse.dates =
    Array.isArray(settings.paySchedules.spouse.dates) && settings.paySchedules.spouse.dates.length
      ? settings.paySchedules.spouse.dates
      : [15, 30];

  if (!settings.earlyDeposit && settings.paySchedules.yours.bankSplit?.fixedAmount?.amount) {
    settings.earlyDeposit = {
      enabled: true,
      bankName: settings.paySchedules.yours.bankSplit.fixedAmount.bank || 'SoFi',
      amount: settings.paySchedules.yours.bankSplit.fixedAmount.amount,
      daysBefore: 1,
      remainderBank: settings.paySchedules.yours.bankSplit.remainder?.bank || 'Bank of America'
    };
  }

  return settings;
}

export function buildFinancialCycle({
  settings: rawSettings = {},
  bills = [],
  currentAvailableBalance = 0,
  todayOverride = null,
  horizonDays = 45
} = {}) {
  const settings = normalizeFinancialSettings(rawSettings);
  const today = todayOverride || formatDateForInput(getPacificTime());

  const allPayEvents = buildHouseholdPayEvents(settings, {
    todayOverride: today,
    horizonDays
  });

  // Money arriving today is already reflected in live available bank balances,
  // so only a strictly-future event ends the current Safe-to-Spend cycle.
  const futurePayEvents = allPayEvents.filter(event => event.date > today);
  const nextRefill = summarizeNextHouseholdRefill(futurePayEvents);
  const nextRefillDate = nextRefill.date || null;
  const cycleEndDate = nextRefillDate ? addDaysToDateOnly(nextRefillDate, -1) : null;

  const canonicalBills = visibleBillOccurrences(bills)
    .filter(bill => bill.status !== 'skipped');

  const pendingBills = canonicalBills.filter(bill => bill.pendingPayment === true);
  const unpaidBills = canonicalBills.filter(bill => bill.pendingPayment !== true);

  const reservedBills = nextRefillDate
    ? unpaidBills.filter(bill => {
        const due = toDateOnly(bill.dueDate || bill.nextDueDate || bill.nextOccurrence);
        return due && due <= cycleEndDate;
      })
    : [];

  const laterBills = nextRefillDate
    ? unpaidBills.filter(bill => {
        const due = toDateOnly(bill.dueDate || bill.nextDueDate || bill.nextOccurrence);
        return due && due > cycleEndDate;
      })
    : unpaidBills;

  const totalReserved = reservedBills.reduce(
    (sum, bill) => sum + (Number(bill.amount ?? bill.cost) || 0),
    0
  );

  const balance = Number(currentAvailableBalance) || 0;
  const safeToSpend = nextRefillDate ? balance - totalReserved : null;
  const daysUntilRefill = nextRefillDate ? getDaysUntilDateInPacific(nextRefillDate) : null;

  // Projection window: show household deposits through the user's next main payday,
  // preserving same-day spouse + early-deposit events.
  const nextYourMainPayday = nextMainPaydayDate(futurePayEvents, 'yours');
  const projectionEndDate = nextYourMainPayday || nextRefillDate;
  const upcomingIncome = futurePayEvents.filter(event =>
    !projectionEndDate || event.date <= projectionEndDate
  );
  const upcomingIncomeTotal = upcomingIncome.reduce(
    (sum, event) => sum + Number(event.amount || 0),
    0
  );

  const afterDeposits = safeToSpend == null
    ? null
    : safeToSpend + upcomingIncomeTotal;

  return {
    settings,
    today,
    payEvents: allPayEvents,
    futurePayEvents,
    upcomingIncome,
    upcomingIncomeTotal,
    nextRefill,
    nextRefillDate,
    daysUntilRefill,
    cycleEndDate,
    nextYourMainPayday,
    canonicalBills,
    pendingBills,
    unpaidBills,
    reservedBills,
    laterBills,
    totalReserved,
    currentAvailableBalance: balance,
    safeToSpend,
    afterDeposits
  };
}

export default buildFinancialCycle;
