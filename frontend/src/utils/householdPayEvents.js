import { PayCycleCalculator } from './PayCycleCalculator';

const parseDateOnly = (value) => {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const parts = raw.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

const toDateOnly = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getToday = (todayOverride) => {
  if (todayOverride) return parseDateOnly(todayOverride);
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
};

export function buildHouseholdPayEvents(settings = {}, options = {}) {
  const today = getToday(options.todayOverride);
  const horizonDays = Number(options.horizonDays || 60);
  const horizon = addDays(today, horizonDays);
  const events = [];

  const yours = settings.paySchedules?.yours || {};
  const spouse = settings.paySchedules?.spouse || {};

  const yourAmountCandidates = [
    yours.amount,
    settings.payAmount,
    settings.yourPayAmount,
    settings.yoursSchedule?.amount
  ].map(value => Number(value) || 0);
  const yourAmount = yourAmountCandidates.find(value => value > 0) || 0;
  const lastPaydate =
    yours.lastPaydate ||
    yours.lastPayDate ||
    settings.lastPayDate ||
    settings.yoursSchedule?.lastPaydate ||
    settings.yoursSchedule?.lastPayDate ||
    null;

  const splitFixedAmount = Number(yours.bankSplit?.fixedAmount?.amount ?? 0) || 0;
  const earlyEnabled =
    settings.earlyDeposit?.enabled === true ||
    settings.enableEarlyDeposit === true ||
    splitFixedAmount > 0;
  const earlyAmount = [
    settings.earlyDeposit?.amount,
    settings.earlyDepositAmount,
    splitFixedAmount
  ].map(value => Number(value) || 0).find(value => value > 0) || 0;
  const daysBefore = Number(
    settings.earlyDeposit?.daysBefore ??
    settings.earlyDeposit?.daysBeforePayday ??
    settings.daysBeforePayday ??
    1
  ) || 1;
  const earlyBank =
    settings.earlyDeposit?.bankName ||
    settings.earlyDepositBank ||
    yours.bankSplit?.fixedAmount?.bank ||
    'Early Deposit Account';
  const remainderBank =
    settings.earlyDeposit?.remainderBank ||
    settings.remainderBank ||
    yours.bankSplit?.remainder?.bank ||
    'Main Account';

  const anchor = parseDateOnly(lastPaydate);
  if (anchor && yourAmount > 0) {
    let mainDate = new Date(anchor);
    while (mainDate < today) {
      mainDate = addDays(mainDate, 14);
    }

    while (mainDate <= horizon) {
      if (earlyEnabled && earlyAmount > 0 && earlyAmount < yourAmount) {
        const earlyDate = addDays(mainDate, -daysBefore);
        if (earlyDate >= today) {
          events.push({
            id: `yours-early-${toDateOnly(mainDate)}`,
            date: toDateOnly(earlyDate),
            amount: earlyAmount,
            owner: 'yours',
            type: 'early',
            bank: earlyBank,
            label: `${settings.personalInfo?.yourName || 'Your'} Early Deposit`,
            mainPaydayDate: toDateOnly(mainDate)
          });
        }

        if (mainDate >= today) {
          events.push({
            id: `yours-main-${toDateOnly(mainDate)}`,
            date: toDateOnly(mainDate),
            amount: Math.max(0, Math.round((yourAmount - earlyAmount) * 100) / 100),
            owner: 'yours',
            type: 'main',
            bank: remainderBank,
            label: `${settings.personalInfo?.yourName || 'Your'} Main Payday`,
            mainPaydayDate: toDateOnly(mainDate)
          });
        }
      } else if (mainDate >= today) {
        events.push({
          id: `yours-main-${toDateOnly(mainDate)}`,
          date: toDateOnly(mainDate),
          amount: yourAmount,
          owner: 'yours',
          type: 'main',
          bank: remainderBank,
          label: 'Your Payday',
          mainPaydayDate: toDateOnly(mainDate)
        });
      }

      mainDate = addDays(mainDate, 14);
    }
  }

  const spouseAmount = [
    spouse.amount,
    settings.spousePayAmount,
    settings.spouseSchedule?.amount
  ].map(value => Number(value) || 0).find(value => value > 0) || 0;

  if (spouseAmount > 0) {
    let cursor = new Date(today);
    while (cursor <= horizon) {
      const spouseDate = PayCycleCalculator.getWifeNextPayday({
        includeToday: true,
        todayOverride: toDateOnly(cursor)
      });
      const spouseDateOnly = toDateOnly(spouseDate);
      if (!spouseDateOnly) break;

      const spouseDateParsed = parseDateOnly(spouseDateOnly);
      if (spouseDateParsed < today) {
        cursor = addDays(cursor, 1);
        continue;
      }

      if (!events.some(e => e.id === `spouse-${spouseDateOnly}`)) {
        events.push({
          id: `spouse-${spouseDateOnly}`,
          date: spouseDateOnly,
          amount: spouseAmount,
          owner: 'spouse',
          type: 'spouse',
          bank: 'Spouse Deposit',
          label: `${settings.personalInfo?.spouseName || 'Spouse'} Main Payday`,
          mainPaydayDate: spouseDateOnly
        });
      }

      cursor = addDays(spouseDateParsed, 1);
    }
  }

  return events
    .filter(event => event.date && event.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function summarizeNextHouseholdRefill(events = []) {
  if (!events.length) {
    return {
      date: null,
      amount: 0,
      events: []
    };
  }

  const date = events[0].date;
  const sameDayEvents = events.filter(event => event.date === date);
  return {
    date,
    amount: sameDayEvents.reduce((sum, event) => sum + Number(event.amount || 0), 0),
    events: sameDayEvents
  };
}

export function summarizeNextFutureHouseholdRefill(events = [], today) {
  const todayDate = String(today || '').slice(0, 10);
  if (!todayDate) return summarizeNextHouseholdRefill(events);

  const futureEvents = events.filter(event => String(event.date || '').slice(0, 10) > todayDate);
  return summarizeNextHouseholdRefill(futureEvents);
}

export function eventsThroughDate(events = [], inclusiveDate) {
  if (!inclusiveDate) return [];
  return events.filter(event => event.date <= inclusiveDate);
}

export function nextMainPaydayDate(events = [], owner = 'yours') {
  return events.find(event => event.owner === owner && event.type === 'main')?.date || null;
}
