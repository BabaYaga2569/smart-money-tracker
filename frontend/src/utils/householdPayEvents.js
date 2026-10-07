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

  const yourAmount = Number(yours.amount ?? settings.payAmount ?? 0) || 0;
  const lastPaydate = yours.lastPaydate || settings.lastPayDate || null;

  const earlyEnabled =
    settings.earlyDeposit?.enabled === true ||
    settings.enableEarlyDeposit === true;
  const earlyAmount = Number(
    settings.earlyDeposit?.amount ??
    settings.earlyDepositAmount ??
    0
  ) || 0;
  const daysBefore = Number(
    settings.earlyDeposit?.daysBefore ??
    settings.earlyDeposit?.daysBeforePayday ??
    settings.daysBeforePayday ??
    1
  ) || 1;
  const earlyBank =
    settings.earlyDeposit?.bankName ||
    settings.earlyDepositBank ||
    'Early Deposit Account';
  const remainderBank =
    settings.earlyDeposit?.remainderBank ||
    settings.remainderBank ||
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
            label: `Early Deposit — ${earlyBank}`,
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
            label: `Main Payday — ${remainderBank}`,
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

  const spouseAmount = Number(
    spouse.amount ??
    settings.spousePayAmount ??
    0
  ) || 0;

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
          label: 'Spouse Payday',
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

export function eventsThroughDate(events = [], inclusiveDate) {
  if (!inclusiveDate) return [];
  return events.filter(event => event.date <= inclusiveDate);
}

export function nextMainPaydayDate(events = [], owner = 'yours') {
  return events.find(event => event.owner === owner && event.type === 'main')?.date || null;
}
