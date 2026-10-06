// Snapshot derived from the live Google Sheet "Our Monthly Bills 3.0" TEMPLATE
// on 2026-10-06. This file is intentionally read-only migration input.
// Applying/replacing Firestore recurringPatterns is a separate, explicit step.

export const RECURRING_REBUILD_SOURCE = {
  spreadsheet: 'Our Monthly Bills 3.0',
  sheet: 'TEMPLATE',
  capturedAt: '2026-10-06',
};

const monthly = (name, amount, day, institutionName, extra = {}) => ({
  name,
  amount,
  type: 'expense',
  frequency: 'monthly',
  status: 'active',
  institutionName: institutionName || null,
  scheduleRule: { kind: 'dayOfMonth', day },
  ...extra,
});

const preserveSchedule = (name, amount, extra = {}) => ({
  name,
  amount,
  type: 'expense',
  frequency: 'monthly',
  status: 'active',
  scheduleRule: { kind: 'preserveCurrent' },
  ...extra,
});

export const RECURRING_REBUILD_PROPOSAL = [
  monthly('Charger Payment', 571.32, 1, 'Bank of America'),
  monthly('Affirm Smoker', 55.25, 3, null, { aliases: ['tractor supply', 'Tractor Supply'], installmentPlan: true, remainingPayments: 8, remainingBalance: 418.01, nextOccurrence: '2026-11-03', endDate: '2027-06-03', finalPaymentAmount: 31.26, scheduleNote: 'Affirm installment plan; final scheduled payment Jun 3, 2027.' }),
  monthly('Dodge Challenger Tracker', 8.95, 3, null, { aliases: ['Challenger Tracker'] }),
  monthly('Starlink Internet', 55.00, 4, 'SoFi', { aliases: ['Starlink'], amountNote: 'Current rate is $55/month; prior $35 rate was a three-month promotion.' }),
  monthly('Pierce Prime Platinum Movies', 37.45, 6, null, { aliases: ['Pierceprime', 'Pierce Prime'] }),
  monthly('Affirm Dog Water Bowl and Vacuum', 21.21, 7, 'Capital One', { aliases: ['Amazon'], installmentPlan: true, remainingPayments: 2, remainingBalance: 42.39, nextOccurrence: '2026-10-07', endDate: '2026-11-07', finalPaymentAmount: 21.18, scheduleNote: 'Affirm installment plan; final scheduled payment Nov 7, 2026.' }),
  monthly('Geico SXS', 31.42, 8, 'Bank of America'),
  monthly('LAS VEGAS VALLEY Water Bill', 26.30, 8, 'SoFi', { aliases: ['Valley', 'Las Vegas Valley Water District'] }),
  monthly('Barclay Card', 30.00, 9, 'Capital One', { aliases: ['Barclays'] }),
  monthly('Geico For all cars kids included', 496.94, 10, null, { aliases: ['Geico Charger Durango', 'Geico Charger Durango Challenger', 'Geico Charger Durango and Challenger', 'Geico Charger, Durango, and Challenger'] }),
  monthly('Walmart Card', null, 10, null, { variableAmount: true, amountNote: 'Amount is set month-to-month based on actual card usage.' }),
  monthly('Affirm Vevor Meat Slicer', 35.83, 10, null, { aliases: ['VEVOR'], installmentPlan: true, remainingPayments: 1, remainingBalance: 35.83, nextOccurrence: '2026-10-10', endDate: '2026-10-10', finalPaymentAmount: 35.83, scheduleNote: 'Affirm installment plan; final scheduled payment Oct 10, 2026.' }),
  monthly('Clean Freak Car Wash Subscription', 27.00, 11, null, { aliases: ['Clean Freak Car Wash'] }),
  monthly('CVS Membership', 5.00, 12, null, { aliases: ['CVS Pharmacy', 'CVS ExtraCare'] }),
  monthly('Affirm Tancis Shopping', 27.32, 14, null, { aliases: ['Walmart Affirm', 'Walmart Affirm Virtual Card'], installmentPlan: true, remainingPayments: 4, remainingBalance: 108.05, nextOccurrence: '2026-10-14', endDate: '2027-01-14', finalPaymentAmount: 26.09, scheduleNote: 'Affirm installment plan; final scheduled payment Jan 14, 2027.' }),
  monthly('Rent - Raylene (15th)', 350.00, 15, 'Capital One', { aliases: ['Zelle to Raylene', 'Rent (mid-month)', 'Rent mid month'] }),
  monthly('Side X Side America 1st Credit Union', 295.36, 15, 'Bank of America', { aliases: ['AMERICA FIRST CU LOAN Bill Payment', 'America First Credit Union loan payment'] }),
  monthly('Dodge Ram Tracker', 8.95, 15, null),
  monthly('CHRYSLER CAPITAL Durango Payment', 618.00, 15, 'USAA', { aliases: ['Chrysler Capital'] }),
  monthly('Season Tickets Rams', 601.00, 15, 'USAA', {
    aliases: ['The Los Angeles Rams', 'Los Angeles Rams', 'Rams Season Tickets'],
    customRecurrence: true,
    activeMonths: [1,2,3,4,5,6,7,8,11,12],
    scheduleNote: '10 monthly payments; skip September and October',
  }),
  monthly('Care Credit', 50.00, 15, null),
  monthly('Citi Card - Costco Card', 200.00, 16, 'Bank of America', { aliases: ['CITI CARD ONLINE'] }),
  monthly('Peacock / Apple Pay', 12.99, 17, null, { aliases: ['Peacock'] }),
  monthly('Clean Freak Tancis Car', 27.00, 17, null, { aliases: ['Clean Freak Car Wash'] }),
  monthly('Disney Plus / Apple Pay', 18.99, 19, null, { aliases: ['Disney Plus'] }),
  monthly('Affirm Buffet setup and Network Switch', 32.46, 19, null, { aliases: ['Amazon'], installmentPlan: true, remainingPayments: 2, remainingBalance: 64.91, nextOccurrence: '2026-10-19', endDate: '2026-11-19', finalPaymentAmount: 32.45, scheduleNote: 'Affirm installment plan; final scheduled payment Nov 19, 2026.' }),
  monthly('Sirius Bubba', 12.99, 19, null, { aliases: ['SiriusXM'] }),
  monthly('Courtneys BofA Credit Card', 200.00, 20, null),
  monthly('T-Mobile Cell Phone Bill', 485.26, 21, null, { aliases: ['T-Mobile'] }),
  monthly('Family Apple Music / Apple Pay', 19.99, 21, null, { aliases: ['Family Apple Music', 'Apple Music'] }),
  monthly('Optimum Cell Phone', 15.64, 25, 'Bank of America', { aliases: ['Optimum', 'Optimum Mobile'] }),
  preserveSchedule('Plaid Technologies Inc', 6.26, { aliases: ['Plaid Technologies', 'Plaid'], scheduleNote: 'Keep the existing recurring schedule; only the subscription identity is confirmed.' }),
  monthly('NV Energy', 177.00, 26, 'Bank of America'),
  monthly('GitHub Subscription', 10.00, 26, null, { aliases: ['GitHub'] }),
  monthly('Apple iCloud Plus / Apple Pay', 10.99, 28, null, { aliases: ['Apple iCloud', 'iCloud'] }),
  monthly('Claude AI Subscription', 20.00, 28, null, { aliases: ['Anthropic', 'Claude'] }),
  monthly('Blink Camera', 11.99, 29, null, { aliases: ['Amazon Blink', 'Blink'] }),
  monthly('Southwest Gas', 36.62, 29, null),
  monthly('Google One Storage', 19.99, 30, null, { aliases: ['Google One'] }),
  monthly('Bankruptcy Payment', 1390.99, 30, null),
  monthly('Rent - Raylene (30th)', 350.00, 30, 'Capital One', {
    aliases: ['Zelle to Raylene', 'Rent (end of month)', 'Rent end of month'],
    scheduleNote: 'Second partial rent payment; fixed on the 30th.'
  }),
  {
    name: 'Republic Services',
    amount: 59.19,
    type: 'expense',
    frequency: 'quarterly',
    status: 'active',
    institutionName: 'Bank of America',
    aliases: ['Republic Services'],
    scheduleRule: {
      kind: 'quarterEndLastDay',
      months: [3, 6, 9, 12],
    },
    scheduleNote: 'Quarterly trash service; Mar/Jun/Sep/Dec month-end',
  },
];

// TEMPLATE rows intentionally not auto-imported because they are not normal
// recurring bills or do not contain enough information to safely create one.
export const RECURRING_REBUILD_REVIEW = [];

export const RECURRING_REBUILD_EXCLUSIONS = [
  { sourceName: 'Tanci Pay Day', reason: 'Income, not a bill.' },
  { sourceName: 'Optimum Internet', reason: 'User confirmed internet service is no longer active.' },
  { sourceName: 'AfterPay', reason: 'User confirmed this recurring expense no longer exists.' },
  { sourceName: 'Adobe', reason: 'User confirmed this recurring expense no longer exists.' },
  { sourceName: 'Trans to Cap1 Rent', reason: 'Internal transfer; the actual rent obligation is represented separately.' },
  { sourceName: 'Food', reason: 'Cash-flow / food spending buffer, not a bill due on one date.' },
];
